"use server";

// @implements v2-10 院内予約作成 / v2-11 変更・キャンセル / v2-12 ステータス / v2-13 重複防止 / v2-14 セッション

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SessionStep } from "@/features/services/session-template";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { jstDateTimeToUtcISO } from "@/lib/datetime";
import { sanitizeSearchTerm } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { type BookingStatus, nextStatuses } from "./booking-status";
import { layoutSessions, rangeLiteral } from "./session-layout";

export type BookingFormState = { error?: string; bookingId?: string };
export type BookingActionState = { error?: string; ok?: boolean };
export type PatientMatch = { id: string; name: string; kana: string | null; phone: string | null };

/** 予約作成時の患者検索(名前・かな・電話の部分一致) */
export async function searchPatients(slug: string, query: string): Promise<PatientMatch[]> {
  const { user, clinic } = await requireMember(slug);
  const q = sanitizeSearchTerm(query);
  if (q.length < 1) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("patients")
    .select("id, name, kana, phone")
    .eq("clinic_id", clinic.id)
    .or(`name.ilike.%${q}%,kana.ilike.%${q}%,phone.ilike.%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(10);
  // 患者 PII 検索を監査記録(要配慮情報アクセスの追跡)
  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "patient.search",
    diff: { hits: data?.length ?? 0 },
  });
  return data ?? [];
}

const BOOKING_STATUSES = [
  "requested",
  "confirmed",
  "checked_in",
  "done",
  "cancelled",
  "no_show",
] as const;

const createSchema = z
  .object({
    // 患者: 既存 or 新規のいずれか
    patientId: z.union([z.uuid(), z.literal("")]).optional(),
    newPatientName: z.string().max(60).optional(),
    newPatientKana: z.string().max(60).optional(),
    newPatientPhone: z.string().max(20).optional(),
    serviceId: z.uuid("メニューを選択してください"),
    memberId: z.uuid("担当を選択してください"),
    roomId: z.uuid("部屋を選択してください"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付が不正です"),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻が不正です"),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.patientId || (v.newPatientName && v.newPatientName.trim().length > 0), {
    message: "患者を選択するか、新規患者名を入力してください",
    path: ["patientId"],
  });

export async function createBooking(
  slug: string,
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const { user, clinic } = await requireMember(slug);

  const parsed = createSchema.safeParse({
    patientId: formData.get("patientId") || undefined,
    newPatientName: formData.get("newPatientName") || undefined,
    newPatientKana: formData.get("newPatientKana") || undefined,
    newPatientPhone: formData.get("newPatientPhone") || undefined,
    serviceId: formData.get("serviceId"),
    memberId: formData.get("memberId"),
    roomId: formData.get("roomId"),
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  // 過去日時は不可
  const startISO = jstDateTimeToUtcISO(d.startDate, d.startTime);
  if (Date.parse(startISO) < Date.now()) {
    return { error: "過去の日時は予約できません" };
  }

  const supabase = await createClient();

  // メニュー(session_template)取得 + クリニック検証
  const { data: service } = await supabase
    .from("services")
    .select("id, session_template")
    .eq("id", d.serviceId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!service) return { error: "メニューが見つかりません" };

  const steps = service.session_template as unknown as SessionStep[];
  if (!Array.isArray(steps) || steps.length === 0 || steps.some((s) => !(s.duration_min > 0))) {
    return { error: "メニューのセッション構成が不正です。メニュー設定を確認してください" };
  }

  // member / room のクリニック検証(越境防止)
  const [{ data: member }, { data: room }] = await Promise.all([
    supabase
      .from("clinic_members")
      .select("id")
      .eq("id", d.memberId)
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
    supabase.from("rooms").select("id").eq("id", d.roomId).eq("clinic_id", clinic.id).maybeSingle(),
  ]);
  if (!member) return { error: "担当スタッフが見つかりません" };
  if (!room) return { error: "部屋が見つかりません" };

  // 患者の確定(既存 or 新規作成)。新規作成した場合は失敗時に補償削除する。
  let patientId = d.patientId || null;
  let createdPatientId: string | null = null;
  if (!patientId && d.newPatientName) {
    const { data: newPatient, error: pErr } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        name: d.newPatientName.trim(),
        kana: d.newPatientKana?.trim() || null,
        phone: d.newPatientPhone?.trim() || null,
      })
      .select("id")
      .single();
    if (pErr || !newPatient) {
      console.error("[bookings] patient create failed", pErr);
      return { error: "患者の登録に失敗しました" };
    }
    patientId = newPatient.id;
    createdPatientId = newPatient.id;
  } else if (patientId) {
    // 既存患者のクリニック検証
    const { data: p } = await supabase
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .eq("clinic_id", clinic.id)
      .maybeSingle();
    if (!p) return { error: "患者が見つかりません" };
  }

  // 新規患者を作った後の失敗時に呼ぶ補償削除
  const rollbackPatient = async () => {
    if (createdPatientId) {
      await supabase
        .from("patients")
        .delete()
        .eq("id", createdPatientId)
        .eq("clinic_id", clinic.id);
    }
  };

  // セッション展開
  const laid = layoutSessions(steps, startISO);

  // 予約ヘッダ作成
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .insert({
      clinic_id: clinic.id,
      patient_id: patientId,
      service_id: d.serviceId,
      status: "confirmed", // 院内作成は確定扱い
      source: "staff",
      nominated_member_id: d.memberId,
      notes: d.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (bErr || !booking) {
    console.error("[bookings] header create failed", bErr);
    await rollbackPatient();
    return { error: "予約の作成に失敗しました" };
  }

  // セッション作成(EXCLUDE 制約で部屋/スタッフ重複はエラー)
  const sessionRows = laid.map((s) => ({
    clinic_id: clinic.id,
    booking_id: booking.id,
    seq: s.seq,
    kind: s.kind,
    label: s.label,
    member_id: d.memberId,
    room_id: d.roomId,
    time_range: rangeLiteral(s.startISO, s.endISO),
  }));
  const { error: sErr } = await supabase.from("booking_sessions").insert(sessionRows);
  if (sErr) {
    // 重複はロールバック(ヘッダ + 新規患者を消す)
    await supabase.from("bookings").delete().eq("id", booking.id).eq("clinic_id", clinic.id);
    await rollbackPatient();
    if (sErr.code === "23P01") {
      return {
        error: "指定の時間帯は部屋または担当が既に埋まっています。別の時間を選んでください",
      };
    }
    console.error("[bookings] sessions create failed", sErr);
    return { error: "予約枠の登録に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "booking.create",
    targetType: "booking",
    targetId: booking.id,
    diff: { service_id: d.serviceId, sessions: laid.length },
  });
  revalidatePath(`/${slug}`);
  return { bookingId: booking.id };
}

const statusSchema = z.enum(BOOKING_STATUSES);

export async function updateBookingStatus(
  slug: string,
  bookingId: string,
  status: string,
): Promise<BookingActionState> {
  const { user, clinic } = await requireMember(slug);
  if (!z.uuid().safeParse(bookingId).success) return { error: "不正な予約です" };
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "不正なステータスです" };
  // キャンセルは専用処理(セッション解放を伴う)経由に限定
  if (parsed.data === "cancelled") {
    return { error: "キャンセルはキャンセル操作から行ってください" };
  }

  const supabase = await createClient();
  // 現在ステータスを取得し、遷移規則(状態機械)をサーバーで強制
  const { data: current } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!current) return { error: "予約が見つかりません" };
  if (!nextStatuses(current.status as BookingStatus).includes(parsed.data)) {
    return { error: "この予約ではそのステータスに変更できません" };
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: parsed.data })
    .eq("id", bookingId)
    .eq("clinic_id", clinic.id);
  if (error) return { error: "ステータスの更新に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "booking.status",
    targetType: "booking",
    targetId: bookingId,
    diff: { from: current.status, to: parsed.data },
  });
  revalidatePath(`/${slug}`);
  return { ok: true };
}

const cancelSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().max(500).optional(),
});

export async function cancelBooking(
  slug: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const { user, clinic } = await requireMember(slug);
  const parsed = cancelSchema.safeParse({
    bookingId: formData.get("bookingId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "入力内容を確認してください" };

  const supabase = await createClient();
  // 完了済みはキャンセル不可(状態ガード)
  const { data: current } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", parsed.data.bookingId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!current) return { error: "予約が見つかりません" };
  if (current.status === "done") return { error: "完了済みの予約はキャンセルできません" };
  if (current.status === "cancelled") return { ok: true };

  // ヘッダを cancelled に、未実施セッションも cancelled にする(枠を解放)
  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancel_reason: parsed.data.reason || null,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.bookingId)
    .eq("clinic_id", clinic.id);
  if (error) return { error: "キャンセルに失敗しました" };

  await supabase
    .from("booking_sessions")
    .update({ status: "cancelled" })
    .eq("booking_id", parsed.data.bookingId)
    .eq("clinic_id", clinic.id)
    .eq("status", "scheduled");

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "booking.cancel",
    targetType: "booking",
    targetId: parsed.data.bookingId,
    diff: { reason: parsed.data.reason },
  });
  revalidatePath(`/${slug}`);
  return { ok: true };
}
