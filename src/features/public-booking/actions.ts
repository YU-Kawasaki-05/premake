"use server";

// @implements v2-20 ゲスト予約 / v2-21 患者側の照会・キャンセル

import { z } from "zod";
import { layoutSessions, rangeLiteral } from "@/features/bookings/session-layout";
import { enqueueNotification, resolveClinicInternalEmail } from "@/features/notifications/enqueue";
import type { SessionStep } from "@/features/services/session-template";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBookingToken, hashBookingToken } from "./token";

export type GuestBookingState = {
  error?: string;
  done?: { bookingNo: string; manageToken: string; pending: boolean };
};

const guestSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.uuid(),
  memberId: z.uuid(),
  roomId: z.uuid(),
  startISO: z.string().datetime(),
  name: z.string().trim().min(1, "お名前を入力してください").max(60),
  kana: z.string().trim().max(60).optional(),
  email: z.email("メールアドレスの形式が正しくありません"),
  phone: z.string().trim().min(1, "電話番号を入力してください").max(20),
});

/** ゲスト(患者)による予約作成。未ログイン導線のため service role + アプリ層検証。 */
export async function createGuestBooking(
  _prev: GuestBookingState,
  formData: FormData,
): Promise<GuestBookingState> {
  const parsed = guestSchema.safeParse({
    slug: formData.get("slug"),
    serviceId: formData.get("serviceId"),
    memberId: formData.get("memberId"),
    roomId: formData.get("roomId"),
    startISO: formData.get("startISO"),
    name: formData.get("name"),
    kana: formData.get("kana") || undefined,
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;
  const admin = createAdminClient();

  // クリニック(公開中)+ サービス(公開中)+ member/room の検証
  const { data: clinic } = await admin
    .from("clinics")
    .select("id, booking_approval_mode, public_booking_enabled")
    .eq("slug", d.slug)
    .maybeSingle();
  if (!clinic?.public_booking_enabled) {
    return { error: "現在オンライン予約を受け付けていません" };
  }

  const { data: service } = await admin
    .from("services")
    .select("id, session_template")
    .eq("id", d.serviceId)
    .eq("clinic_id", clinic.id)
    .eq("is_public", true)
    .eq("status", "active")
    .maybeSingle();
  if (!service) return { error: "選択されたメニューは予約できません" };

  // member/room がこのクリニックのものか、かつ指定 open 枠内に収まるか
  const startMs = Date.parse(d.startISO);
  const steps = service.session_template as unknown as SessionStep[];
  if (!Array.isArray(steps) || steps.length === 0 || steps.some((s) => !(s.duration_min > 0))) {
    return { error: "このメニューは現在予約できません" };
  }
  const laid = layoutSessions(steps, d.startISO);
  // 収まり検証は表示終端でなく占有終端(バッファ込み)。UI(availableSlots)と同じ基準にし、
  // 直接 POST で清掃バッファが open 枠外にはみ出す予約を弾く(No.33)
  const endMs = Date.parse(laid[laid.length - 1].occupiedEndISO);
  if (startMs < Date.now()) return { error: "過去の時間は予約できません" };

  const { data: block } = await admin
    .from("schedule_blocks")
    .select("id, time_range")
    .eq("clinic_id", clinic.id)
    .eq("member_id", d.memberId)
    .eq("room_id", d.roomId)
    .eq("block_type", "open")
    .overlaps("time_range", rangeLiteral(d.startISO, laid[laid.length - 1].occupiedEndISO))
    .maybeSingle();
  if (!block) return { error: "選択された時間は予約できません。別の枠をお選びください" };
  const br = parseRangeSafe(block.time_range as string);
  if (!br || startMs < Date.parse(br.start) || endMs > Date.parse(br.end)) {
    return { error: "選択された時間は予約できません。別の枠をお選びください" };
  }

  const autoConfirm = clinic.booking_approval_mode === "auto";

  // 予約ヘッダ(patient_id は null。院内で名寄せ)
  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .insert({
      clinic_id: clinic.id,
      service_id: d.serviceId,
      status: autoConfirm ? "confirmed" : "requested",
      source: "web",
      nominated_member_id: d.memberId,
      guest_name: d.name,
      guest_kana: d.kana || null,
      guest_email: d.email,
      guest_phone: d.phone,
    })
    .select("id, booking_no")
    .single();
  if (bErr || !booking) {
    console.error("[public-booking] header failed", bErr);
    return { error: "予約の受付に失敗しました。時間をおいてお試しください" };
  }

  const sessionRows = laid.map((s) => ({
    clinic_id: clinic.id,
    booking_id: booking.id,
    seq: s.seq,
    kind: s.kind,
    label: s.label,
    member_id: d.memberId,
    room_id: d.roomId,
    time_range: rangeLiteral(s.startISO, s.endISO),
    occupied_range: rangeLiteral(s.startISO, s.occupiedEndISO),
    schedule_block_id: block.id,
  }));
  const { error: sErr } = await admin.from("booking_sessions").insert(sessionRows);
  if (sErr) {
    await admin.from("bookings").delete().eq("id", booking.id);
    if (sErr.code === "23P01") {
      return { error: "選択された時間は直前に埋まりました。別の枠をお選びください" };
    }
    console.error("[public-booking] sessions failed", sErr);
    return { error: "予約の受付に失敗しました" };
  }

  // 管理トークン(照会・キャンセル用)
  const { token, tokenHash } = generateBookingToken();
  await admin.from("booking_access_tokens").insert({
    booking_id: booking.id,
    token_hash: tokenHash,
    purpose: "manage",
    expires_at: new Date(endMs + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  await recordAudit({
    clinicId: clinic.id,
    actorType: "guest",
    action: "booking.guest_create",
    targetType: "booking",
    targetId: booking.id,
    diff: { auto: autoConfirm },
  });

  // 受付/確定メールをキューへ(Cron が送信)
  await enqueueNotification({
    clinicId: clinic.id,
    bookingId: booking.id,
    recipientEmail: d.email,
    recipientType: "patient",
    kind: autoConfirm ? "booking_confirmed" : "booking_requested",
  });

  // @implements v2-23 院内(スタッフ)向け通知。manual/auto を問わず常に enqueue し、
  // 承認漏れ=予約喪失(台帳 No.18)を防ぐ。宛先が解決できなければ enqueue 側でスキップ。
  const internalEmail = await resolveClinicInternalEmail(clinic.id);
  await enqueueNotification({
    clinicId: clinic.id,
    bookingId: booking.id,
    recipientEmail: internalEmail,
    recipientType: "member",
    kind: "booking_created_internal",
  });

  return { done: { bookingNo: booking.booking_no, manageToken: token, pending: !autoConfirm } };
}

export type ManagedBooking = {
  bookingNo: string;
  clinicName: string;
  clinicSlug: string;
  status: string;
  serviceName: string | null;
  startISO: string | null;
  endISO: string | null;
  cancelDeadlineHours: number;
};

/** 管理トークンから予約内容を取得(患者向け表示用) */
export async function getManagedBooking(token: string): Promise<ManagedBooking | null> {
  const admin = createAdminClient();
  const { data: tok } = await admin
    .from("booking_access_tokens")
    .select("booking_id, purpose, expires_at")
    .eq("token_hash", hashBookingToken(token))
    .maybeSingle();
  if (tok?.purpose !== "manage" || new Date(tok.expires_at) < new Date()) return null;

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "booking_no, status, service:services!bookings_service_id_fkey(name), clinic:clinics(name, slug, cancel_deadline_hours), sessions:booking_sessions!booking_sessions_booking_id_fkey(time_range, status, seq)",
    )
    .eq("id", tok.booking_id)
    .maybeSingle();
  if (!booking?.clinic) return null;

  const active = (booking.sessions ?? [])
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.seq - b.seq);
  const first = active[0];
  const last = active[active.length - 1];
  const fr = first ? parseRangeSafe(first.time_range as string) : null;
  const lr = last ? parseRangeSafe(last.time_range as string) : null;

  return {
    bookingNo: booking.booking_no,
    clinicName: booking.clinic.name,
    clinicSlug: booking.clinic.slug,
    status: booking.status,
    serviceName: booking.service?.name ?? null,
    startISO: fr?.start ?? null,
    endISO: lr?.end ?? null,
    cancelDeadlineHours: booking.clinic.cancel_deadline_hours,
  };
}

const lookupSchema = z.object({
  slug: z.string().min(1),
  bookingNo: z.string().trim().min(1),
  email: z.email(),
});

export type LookupState = {
  error?: string;
  found?: { manageToken: string };
};

/** 予約番号 + メールで照会し、管理トークンを再発行して返す */
export async function lookupBooking(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const parsed = lookupSchema.safeParse({
    slug: formData.get("slug"),
    bookingNo: formData.get("bookingNo"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: "入力内容を確認してください" };

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (!clinic) return { error: "照会できませんでした" };

  const { data: booking } = await admin
    .from("bookings")
    .select("id, guest_email")
    .eq("clinic_id", clinic.id)
    .eq("booking_no", parsed.data.bookingNo)
    .maybeSingle();
  // メール不一致でも同じ応答(照会の総当たり対策)
  if (!booking || booking.guest_email?.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return { error: "該当する予約が見つかりませんでした。予約番号とメールをご確認ください" };
  }

  const { token, tokenHash } = generateBookingToken();
  await admin.from("booking_access_tokens").insert({
    booking_id: booking.id,
    token_hash: tokenHash,
    purpose: "manage",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  return { found: { manageToken: token } };
}

/** 管理トークンによる患者側キャンセル */
export async function cancelByToken(token: string): Promise<{ error?: string; ok?: boolean }> {
  const admin = createAdminClient();
  const { data: tok } = await admin
    .from("booking_access_tokens")
    .select("booking_id, purpose, expires_at")
    .eq("token_hash", hashBookingToken(token))
    .maybeSingle();
  if (tok?.purpose !== "manage" || new Date(tok.expires_at) < new Date()) {
    return { error: "リンクが無効です" };
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, clinic_id, status, clinic:clinics(cancel_deadline_hours)")
    .eq("id", tok.booking_id)
    .maybeSingle();
  if (!booking) return { error: "予約が見つかりません" };
  if (booking.status === "cancelled") return { ok: true };
  if (booking.status === "done" || booking.status === "checked_in") {
    return { error: "この予約はキャンセルできません。クリニックへご連絡ください" };
  }

  // キャンセル期限チェック(最初のセッション開始 − 期限時間)
  const { data: firstSession } = await admin
    .from("booking_sessions")
    .select("time_range")
    .eq("booking_id", booking.id)
    .eq("status", "scheduled")
    .order("time_range")
    .limit(1)
    .maybeSingle();
  if (firstSession) {
    const r = parseRangeSafe(firstSession.time_range as string);
    const deadlineH = booking.clinic?.cancel_deadline_hours ?? 24;
    if (r && Date.parse(r.start) - Date.now() < deadlineH * 60 * 60 * 1000) {
      return {
        error: `キャンセル期限(${deadlineH}時間前)を過ぎています。クリニックへご連絡ください`,
      };
    }
  }

  // ヘッダの cancelled 更新とセッション解放を単一トランザクション(RPC)で原子的に行う。
  // 分割すると片方失敗で枠(EXCLUDE)がロックされ再予約不能になる(BUG-03)。
  const { error: cancelErr } = await admin.rpc("cancel_booking", {
    p_booking_id: booking.id,
    p_clinic_id: booking.clinic_id,
    p_reason: "患者キャンセル",
  });
  if (cancelErr) return { error: "キャンセルに失敗しました。時間をおいてお試しください" };

  await recordAudit({
    clinicId: booking.clinic_id,
    actorType: "guest",
    action: "booking.guest_cancel",
    targetType: "booking",
    targetId: booking.id,
  });
  return { ok: true };
}

function parseRangeSafe(range: string): { start: string; end: string } | null {
  const m = range.match(/^\[?"?([^",]+)"?,\s*"?([^")]+)"?\)?$/);
  if (!m) return null;
  return { start: m[1], end: m[2] };
}
