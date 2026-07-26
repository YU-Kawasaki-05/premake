import { timingSafeEqual } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { pickNotificationSessions } from "@/features/notifications/select-sessions";
import { type NotificationKind, renderNotification } from "@/features/notifications/templates";
import { generateBookingToken } from "@/features/public-booking/token";
import { parseRange } from "@/features/schedule/week";
import { TIME_ZONE } from "@/lib/datetime";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

// @implements v2-24 リマインダー + v2-23 通知送信(Vercel Cron から定期実行)
export const dynamic = "force-dynamic";

/** 送信失敗時の再試行上限(No.20)。到達で恒久 failed */
const MAX_ATTEMPTS = 3;
/** status='sending' のまま放置された行を queued に戻すまでの猶予(ROB-03) */
const STALE_SENDING_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  // 認可: 本番相当では CRON_SECRET を必須とし、未設定なら fail-closed で拒否する。
  // 開発(next dev = NODE_ENV=development)でのみ未設定を許可する。
  const secret = env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    // 定数時間比較(AUTH-3)。長さ不一致は timingSafeEqual が例外を投げるため先に弾く。
    const expected = Buffer.from(`Bearer ${secret}`);
    const provided = Buffer.from(auth);
    const authorized = provided.length === expected.length && timingSafeEqual(provided, expected);
    if (!authorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV !== "development") {
    console.error("[cron] CRON_SECRET is not set; refusing request in non-development environment");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const recovered = await recoverStaleSending();
  const reminded = await scanReminders();
  const sent = await processQueue();

  return NextResponse.json({ ok: true, recovered, reminded, sent });

  // --- 送信中のまま落ちた通知の回収(ROB-03) ---
  // クレーム(status='sending')後にプロセスが落ちると誰も再処理しないため、
  // sending_at が古い行を queued に戻して次のループで拾い直す。
  // 猶予は送信 1 件の想定所要より十分長い 10 分。
  async function recoverStaleSending(): Promise<number> {
    const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
    const { data } = await admin
      .from("notifications")
      .update({ status: "queued" })
      .eq("status", "sending")
      .lt("sending_at", staleBefore)
      .select("id");
    return data?.length ?? 0;
  }

  // --- リマインダーの走査(ROB-04: now〜翌日末 JST を対象窓にする) ---
  // 「実行時点の翌日」だけを見ると、前日の cron 実行後に作られた直前予約を取りこぼす。
  // 当日のこれから始まる分まで含めることで、深夜作成の翌日予約も必ず 1 回は対象になる。
  // 冪等性は「kind='reminder' が既にあればスキップ」で担保(窓が重なっても二重送信しない)。
  async function scanReminders(): Promise<number> {
    const now = new Date();
    const tomorrow = formatInTimeZone(
      new Date(now.getTime() + 24 * 60 * 60 * 1000),
      TIME_ZONE,
      "yyyy-MM-dd",
    );
    const from = now.toISOString();
    const to = new Date(`${tomorrow}T23:59:59+09:00`).toISOString();

    const { data: sessions } = await admin
      .from("booking_sessions")
      .select(
        "booking_id, time_range, booking:bookings!booking_sessions_booking_id_fkey(id, clinic_id, status)",
      )
      .eq("status", "scheduled")
      .overlaps("time_range", `[${from},${to})`);

    // overlaps は「開始済みで now を跨いでいる」セッションも拾う。
    // 既に始まった予約にリマインダーは送らないため、開始が now より後のものだけ残す。
    const bookingIds = Array.from(
      new Set(
        (sessions ?? [])
          .filter((s) => {
            if (s.booking?.status !== "confirmed") return false;
            const r = parseRange(s.time_range as string);
            return !!r && new Date(r.start).getTime() > now.getTime();
          })
          .map((s) => s.booking_id),
      ),
    );
    let count = 0;
    for (const bookingId of bookingIds) {
      // 既にリマインダー済みならスキップ
      const { count: existing } = await admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", bookingId)
        .eq("kind", "reminder");
      if ((existing ?? 0) > 0) continue;

      const { data: booking } = await admin
        .from("bookings")
        .select("id, clinic_id, guest_email, patient:patients!bookings_patient_id_fkey(email)")
        .eq("id", bookingId)
        .maybeSingle();
      const email = booking?.guest_email ?? booking?.patient?.email ?? null;
      if (!booking || !email) continue;

      await admin.from("notifications").insert({
        clinic_id: booking.clinic_id,
        booking_id: booking.id,
        recipient_type: "patient",
        recipient_email: email,
        kind: "reminder",
        status: "queued",
      });
      count++;
    }
    return count;
  }

  // --- キューに積まれた通知の送信 ---
  async function processQueue(): Promise<number> {
    const { data: queued } = await admin
      .from("notifications")
      .select("id, clinic_id, booking_id, recipient_email, kind, attempts")
      .eq("status", "queued")
      .limit(50);

    let count = 0;
    for (const n of queued ?? []) {
      // 行単位のクレーム(ROB-03)。queued のままの行だけを sending へ落とせる条件付き UPDATE。
      // 0 行なら他プロセス(重複起動した cron)が先に取得済み → この実行では触らない。
      const { data: claimed } = await admin
        .from("notifications")
        .update({ status: "sending", sending_at: new Date().toISOString() })
        .eq("id", n.id)
        .eq("status", "queued")
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const ctx = await buildContext(n.booking_id, n.clinic_id, n.kind);
      if (!ctx) {
        // 恒久エラー(参照先が消えた等)。再送しても直らないので即 failed で隔離。
        await admin
          .from("notifications")
          .update({ status: "failed", error: "context not found" })
          .eq("id", n.id);
        continue;
      }
      const rendered = renderNotification(n.kind as Parameters<typeof renderNotification>[0], ctx);
      if (!rendered) {
        // 未知 kind は failed にして隔離。次回以降に再取得されず、他の通知送信も止めない
        await admin
          .from("notifications")
          .update({ status: "failed", error: `unknown notification kind: ${n.kind}` })
          .eq("id", n.id);
        continue;
      }
      const res = await sendEmail({
        to: n.recipient_email,
        subject: rendered.subject,
        html: rendered.html,
        fromName: ctx.clinicName,
      });
      if (res.ok) {
        await admin
          .from("notifications")
          .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
          .eq("id", n.id);
        count++;
      } else {
        // 送信失敗はリトライ対象(No.20)。attempts をインクリメントし、上限到達で恒久 failed。
        // 上限未満は queued のまま残し、次回 cron で自動再送する。
        const nextAttempts = n.attempts + 1;
        await admin
          .from("notifications")
          .update({
            status: nextAttempts >= MAX_ATTEMPTS ? "failed" : "queued",
            attempts: nextAttempts,
            error: res.error ?? null,
          })
          .eq("id", n.id);
      }
    }
    return count;
  }

  async function buildContext(bookingId: string | null, clinicId: string, kind: string) {
    if (!bookingId) return null;
    const { data: booking } = await admin
      .from("bookings")
      .select(
        "booking_no, status, guest_name, patient:patients!bookings_patient_id_fkey(name), service:services!bookings_service_id_fkey(name), clinic:clinics(name, slug), sessions:booking_sessions!booking_sessions_booking_id_fkey(time_range, status, seq)",
      )
      .eq("id", bookingId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!booking?.clinic) return null;

    // booking_cancelled はキャンセル後に全セッションが cancelled になるため、
    // scheduled 限定だと日時が出せない。pickNotificationSessions が cancelled を補う(NT-NEW-2)。
    const active = pickNotificationSessions(kind as NotificationKind, booking.sessions ?? []);
    const fr = active[0] ? parseRange(active[0].time_range as string) : null;
    const lr = active[active.length - 1]
      ? parseRange(active[active.length - 1].time_range as string)
      : null;

    // 管理リンクが要る種別は都度トークンを再発行
    let manageUrl: string | undefined;
    let dashboardUrl: string | undefined;
    let requiresApproval: boolean | undefined;
    if (kind === "booking_created_internal" || kind === "booking_cancelled_internal") {
      // 院内向け。患者用 manage トークンは発行せず、院内ダッシュボードへ誘導する
      dashboardUrl = `${env.APP_URL}/${booking.clinic.slug}`;
      requiresApproval =
        kind === "booking_created_internal" ? booking.status === "requested" : undefined;
    } else if (kind !== "booking_cancelled") {
      const { token, tokenHash } = generateBookingToken();
      // トークン insert 失敗を検査。失敗時はリンク切れメールを送らないよう manageUrl を未定義のままにする(NT-NEW-4)
      const { error: tokErr } = await admin.from("booking_access_tokens").insert({
        booking_id: bookingId,
        token_hash: tokenHash,
        purpose: "manage",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (tokErr) {
        console.error("[cron] manage token insert failed; sending mail without link", tokErr);
      } else {
        manageUrl = `${env.APP_URL}/c/${booking.clinic.slug}/manage/${token}`;
      }
    }

    return {
      clinicName: booking.clinic.name,
      patientName: booking.patient?.name ?? booking.guest_name ?? "お客様",
      serviceName: booking.service?.name ?? "施術",
      startISO: fr?.start ?? null,
      endISO: lr?.end ?? null,
      bookingNo: booking.booking_no,
      manageUrl,
      dashboardUrl,
      requiresApproval,
    };
  }
}
