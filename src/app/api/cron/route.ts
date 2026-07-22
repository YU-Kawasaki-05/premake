import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { renderNotification } from "@/features/notifications/templates";
import { generateBookingToken } from "@/features/public-booking/token";
import { parseRange } from "@/features/schedule/week";
import { TIME_ZONE } from "@/lib/datetime";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

// @implements v2-24 リマインダー + v2-23 通知送信(Vercel Cron から定期実行)
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 認可: 本番相当では CRON_SECRET を必須とし、未設定なら fail-closed で拒否する。
  // 開発(next dev = NODE_ENV=development)でのみ未設定を許可する。
  const secret = env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV !== "development") {
    console.error("[cron] CRON_SECRET is not set; refusing request in non-development environment");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const reminded = await scanReminders();
  const sent = await processQueue();

  return NextResponse.json({ ok: true, reminded, sent });

  // --- 前日リマインダーの走査 ---
  async function scanReminders(): Promise<number> {
    const tomorrow = formatInTimeZone(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      TIME_ZONE,
      "yyyy-MM-dd",
    );
    const from = new Date(`${tomorrow}T00:00:00+09:00`).toISOString();
    const to = new Date(`${tomorrow}T23:59:59+09:00`).toISOString();

    const { data: sessions } = await admin
      .from("booking_sessions")
      .select("booking_id, booking:bookings(id, clinic_id, status)")
      .eq("status", "scheduled")
      .overlaps("time_range", `[${from},${to})`);

    const bookingIds = Array.from(
      new Set(
        (sessions ?? []).filter((s) => s.booking?.status === "confirmed").map((s) => s.booking_id),
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
        .select("id, clinic_id, guest_email, patient:patients(email)")
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
      .select("id, clinic_id, booking_id, recipient_email, kind")
      .eq("status", "queued")
      .limit(50);

    let count = 0;
    for (const n of queued ?? []) {
      const ctx = await buildContext(n.booking_id, n.clinic_id, n.kind);
      if (!ctx) {
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
      });
      await admin
        .from("notifications")
        .update({
          status: res.ok ? "sent" : "failed",
          sent_at: res.ok ? new Date().toISOString() : null,
          error: res.error ?? null,
        })
        .eq("id", n.id);
      if (res.ok) count++;
    }
    return count;
  }

  async function buildContext(bookingId: string | null, clinicId: string, kind: string) {
    if (!bookingId) return null;
    const { data: booking } = await admin
      .from("bookings")
      .select(
        "booking_no, status, guest_name, patient:patients(name), service:services(name), clinic:clinics(name, slug), sessions:booking_sessions(time_range, status, seq)",
      )
      .eq("id", bookingId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (!booking?.clinic) return null;

    const active = (booking.sessions ?? [])
      .filter((s) => s.status === "scheduled")
      .sort((a, b) => a.seq - b.seq);
    const fr = active[0] ? parseRange(active[0].time_range as string) : null;
    const lr = active[active.length - 1]
      ? parseRange(active[active.length - 1].time_range as string)
      : null;

    // 管理リンクが要る種別は都度トークンを再発行
    let manageUrl: string | undefined;
    let dashboardUrl: string | undefined;
    let requiresApproval: boolean | undefined;
    if (kind === "booking_created_internal") {
      // 院内向け。患者用 manage トークンは発行せず、院内ダッシュボードへ誘導する
      dashboardUrl = `${env.APP_URL}/${booking.clinic.slug}`;
      requiresApproval = booking.status === "requested";
    } else if (kind !== "booking_cancelled") {
      const { token, tokenHash } = generateBookingToken();
      await admin.from("booking_access_tokens").insert({
        booking_id: bookingId,
        token_hash: tokenHash,
        purpose: "manage",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      manageUrl = `${env.APP_URL}/c/${booking.clinic.slug}/manage/${token}`;
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
