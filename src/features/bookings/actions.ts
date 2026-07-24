"use server";

// @implements v2-10 院内予約作成 / v2-11 変更・キャンセル / v2-12 ステータス / v2-13 重複防止 / v2-14 セッション
// @implements v2-16 名寄せ(ゲスト予約 → 患者マスタの候補提示・受付による紐付け)

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueNotification } from "@/features/notifications/enqueue";
import { parseRange } from "@/features/schedule/week";
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

// ============================================================
// 名寄せ(v2-16 / 台帳 No.14)
// ゲスト予約(patient_id = null・guest_* 保持)を患者マスタへ紐付ける受付導線。
// 自動マージは行わない: 候補を提示し、受付が目視確認して明示操作で紐付ける。
// ============================================================

export type PatientLinkCandidate = {
  id: string;
  name: string;
  kana: string | null;
  phone: string | null;
  email: string | null;
  /** 候補として提示した理由ラベル(メール一致 / 電話一致 / 氏名類似 等) */
  reasons: string[];
};

/** 予約時点でゲストが申告した連絡先(紐付け前の確認・新規登録のプレビュー用) */
export type GuestContact = {
  name: string;
  kana: string | null;
  phone: string | null;
  email: string | null;
};

export type PatientLinkCandidatesResult = {
  error?: string;
  guest?: GuestContact;
  candidates?: PatientLinkCandidate[];
};

const CANDIDATE_LIMIT = 5;
/** SQL 側の粗い前絞り込みで読む上限(厳密判定は JS 側で行う) */
const CANDIDATE_SCAN_LIMIT = 50;

/** 電話番号を数字列に正規化(ハイフン・空白・国番号 +81 の差異を吸収) */
function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("81") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

/** 氏名・かなの表記ゆれ比較用に空白(半角・全角)を除去する */
function compactName(input: string | null | undefined): string {
  return (input ?? "").replace(/[\s\u3000]+/g, "");
}

/**
 * `.or()` の値として安全な形にする。`,` `(` `)` は PostgREST のフィルタ構文、
 * `%` `_` は ilike ワイルドカードのため除去する(メールの `.` `@` は保持)。
 */
function sanitizeOrValue(input: string): string {
  return input
    .replace(/[,()*:"'\\%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * ゲスト予約の連絡先から既存患者の候補を返す(最大 5 件・スコア順)。
 * SQL は粗い前絞り込みに留め、一致理由は正規化した値で JS 側が厳密に判定する
 * (電話のハイフン位置・メールの大文字小文字・氏名の空白差を SQL で表現できないため)。
 * @implements v2-16
 */
export async function findPatientLinkCandidates(
  slug: string,
  bookingId: string,
): Promise<PatientLinkCandidatesResult> {
  const { user, clinic } = await requireMember(slug);
  if (!z.uuid().safeParse(bookingId).success) return { error: "不正な予約です" };

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, patient_id, guest_name, guest_kana, guest_phone, guest_email")
    .eq("id", bookingId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!booking) return { error: "予約が見つかりません" };
  if (booking.patient_id || !booking.guest_name) {
    return { error: "この予約は紐付けできません" };
  }

  const guest: GuestContact = {
    name: booking.guest_name,
    kana: booking.guest_kana,
    phone: booking.guest_phone,
    email: booking.guest_email,
  };

  const emailTerm = sanitizeOrValue(guest.email ?? "");
  const nameTerm = sanitizeSearchTerm(guest.name);
  const kanaTerm = sanitizeSearchTerm(guest.kana ?? "");
  const phoneDigits = normalizePhone(guest.phone);

  const conds: string[] = [];
  if (emailTerm) conds.push(`email.ilike.${emailTerm}`);
  if (nameTerm) conds.push(`name.ilike.%${nameTerm}%`);
  if (kanaTerm) conds.push(`kana.ilike.%${kanaTerm}%`);
  // 姓だけの粗引き(「山田 花子」↔「山田花子」の表記差を前絞り込みで落とさないため)
  const nameHead = nameTerm.includes(" ") ? nameTerm.split(" ")[0] : nameTerm.slice(0, 2);
  if (nameHead.length >= 2 && nameHead !== nameTerm) conds.push(`name.ilike.%${nameHead}%`);
  const kanaHead = kanaTerm.includes(" ") ? kanaTerm.split(" ")[0] : kanaTerm.slice(0, 2);
  if (kanaHead.length >= 2 && kanaHead !== kanaTerm) conds.push(`kana.ilike.%${kanaHead}%`);
  // 電話はハイフン位置が揃わないため末尾 4 桁で粗く引く(完全一致は JS 側で判定)
  if (phoneDigits.length >= 4) conds.push(`phone.ilike.%${phoneDigits.slice(-4)}%`);

  let candidates: PatientLinkCandidate[] = [];
  if (conds.length > 0) {
    const { data: patients } = await supabase
      .from("patients")
      .select("id, name, kana, phone, email")
      .eq("clinic_id", clinic.id)
      .or(conds.join(","))
      .limit(CANDIDATE_SCAN_LIMIT);

    const gEmail = (guest.email ?? "").trim().toLowerCase();
    const gName = compactName(guest.name);
    const gKana = compactName(guest.kana);

    const scored = (patients ?? [])
      .map((p) => {
        const reasons: string[] = [];
        let score = 0;
        if (gEmail && p.email && p.email.trim().toLowerCase() === gEmail) {
          reasons.push("メール一致");
          score += 60;
        }
        if (phoneDigits && normalizePhone(p.phone) === phoneDigits) {
          reasons.push("電話一致");
          score += 40;
        }
        const pName = compactName(p.name);
        if (gName && pName) {
          if (pName === gName) {
            reasons.push("氏名一致");
            score += 20;
          } else if (pName.includes(gName) || gName.includes(pName)) {
            reasons.push("氏名類似");
            score += 10;
          }
        }
        const pKana = compactName(p.kana);
        if (gKana && pKana) {
          if (pKana === gKana) {
            reasons.push("かな一致");
            score += 10;
          } else if (pKana.includes(gKana) || gKana.includes(pKana)) {
            reasons.push("かな類似");
            score += 5;
          }
        }
        return { patient: p, reasons, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.patient.name.localeCompare(b.patient.name, "ja"))
      .slice(0, CANDIDATE_LIMIT);

    candidates = scored.map((r) => ({
      id: r.patient.id,
      name: r.patient.name,
      kana: r.patient.kana,
      phone: r.patient.phone,
      email: r.patient.email,
      reasons: r.reasons,
    }));
  }

  // 患者 PII の検索を監査記録(diff は件数のみ。PII は残さない)
  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "patient.link_candidates",
    targetType: "booking",
    targetId: bookingId,
    diff: { hits: candidates.length },
  });

  return { guest, candidates };
}

const linkSchema = z
  .object({
    bookingId: z.uuid(),
    mode: z.enum(["existing", "new"]),
    patientId: z.union([z.uuid(), z.literal("")]).optional(),
  })
  .refine((v) => v.mode === "new" || !!v.patientId, {
    message: "紐付ける患者を選択してください",
    path: ["patientId"],
  });

/**
 * ゲスト予約を既存患者へ紐付ける(mode=existing)、または guest_* から新規患者を作って
 * 紐付ける(mode=new)。guest_* は予約時点の申告情報として残す(履歴保全)。
 * 院内の内部操作なので通知は送らない。
 * @implements v2-16
 */
export async function linkGuestBookingToPatient(
  slug: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  // 受付業務のため member 全員に許可(owner 限定にしない)
  const { user, clinic } = await requireMember(slug);

  const parsed = linkSchema.safeParse({
    bookingId: formData.get("bookingId"),
    mode: formData.get("mode") === "new" ? "new" : "existing",
    patientId: formData.get("patientId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, patient_id, guest_name, guest_kana, guest_phone, guest_email")
    .eq("id", d.bookingId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!booking) return { error: "予約が見つかりません" };
  if (booking.patient_id || !booking.guest_name) {
    return { error: "この予約は紐付けできません" };
  }

  let patientId: string;
  let createdPatientId: string | null = null;
  if (d.mode === "new") {
    const { data: created, error: pErr } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        name: booking.guest_name.trim(),
        kana: booking.guest_kana?.trim() || null,
        phone: booking.guest_phone?.trim() || null,
        email: booking.guest_email?.trim() || null,
      })
      .select("id")
      .single();
    if (pErr || !created) {
      console.error("[bookings] link: patient create failed", pErr);
      return { error: "患者の登録に失敗しました" };
    }
    patientId = created.id;
    createdPatientId = created.id;
  } else {
    if (!d.patientId) return { error: "紐付ける患者を選択してください" };
    // 既存患者のクリニック検証(越境防止)
    const { data: p } = await supabase
      .from("patients")
      .select("id")
      .eq("id", d.patientId)
      .eq("clinic_id", clinic.id)
      .maybeSingle();
    if (!p) return { error: "患者が見つかりません" };
    patientId = p.id;
  }

  // 楽観ロック: patient_id が null のままであることを UPDATE 条件に含め、更新行数で競合を検出する
  const { data: updated, error } = await supabase
    .from("bookings")
    .update({ patient_id: patientId })
    .eq("id", d.bookingId)
    .eq("clinic_id", clinic.id)
    .is("patient_id", null)
    .select("id");
  if (error || !updated || updated.length === 0) {
    // 新規作成した患者は宛先を失うので補償削除(createBooking の rollbackPatient と同方針)
    if (createdPatientId) {
      await supabase
        .from("patients")
        .delete()
        .eq("id", createdPatientId)
        .eq("clinic_id", clinic.id);
    }
    if (error) {
      console.error("[bookings] link: update failed", error);
      return { error: "紐付けに失敗しました" };
    }
    return { error: "他の操作と競合しました。画面を更新してやり直してください" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "patient.link",
    targetType: "booking",
    targetId: d.bookingId,
    diff: { patient_id: patientId, mode: d.mode },
  });

  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/patients`);
  revalidatePath(`/${slug}/patients/${patientId}`);
  return { ok: true };
}

const BOOKING_STATUSES = [
  "requested",
  "confirmed",
  "checked_in",
  "done",
  "cancelled",
  "no_show",
] as const;

/**
 * BC-NEW-05: yyyy-mm-dd + HH:mm が JST の実在日時か検証する。
 * regex を通っても暦上不正な値(例: 2026-13-40)は new Date() が Invalid になり、
 * jstDateTimeToUtcISO の toISOString() が RangeError で落ちる。ここで事前に弾く。
 */
function isRealJstDateTime(date: string, time: string): boolean {
  const [y, mo, da] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const ms = Date.parse(`${date}T${time}:00+09:00`);
  if (Number.isNaN(ms)) return false;
  // UTC インスタンス + 9h の UTC 各成分 = JST の壁時計。入力成分と一致すれば実在日時。
  const jst = new Date(ms + 9 * 60 * 60 * 1000);
  return (
    jst.getUTCFullYear() === y &&
    jst.getUTCMonth() + 1 === mo &&
    jst.getUTCDate() === da &&
    jst.getUTCHours() === h &&
    jst.getUTCMinutes() === mi
  );
}

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
  })
  .refine((v) => isRealJstDateTime(v.startDate, v.startTime), {
    message: "日付が不正です",
    path: ["startDate"],
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

  // BC-NEW-04: 各セッションが収まる open な施術枠(schedule_block)を探して紐づける。
  // v2-10「枠外への強制作成も可」を維持するため、見つからなければ null のまま作成継続。
  const { data: openBlocks } = await supabase
    .from("schedule_blocks")
    .select("id, time_range")
    .eq("clinic_id", clinic.id)
    .eq("member_id", d.memberId)
    .eq("room_id", d.roomId)
    .eq("block_type", "open")
    .overlaps("time_range", rangeLiteral(laid[0].startISO, laid[laid.length - 1].occupiedEndISO));

  const blockForSession = (sStartISO: string, sEndISO: string): string | null => {
    const s = Date.parse(sStartISO);
    const e = Date.parse(sEndISO);
    for (const b of openBlocks ?? []) {
      const r = parseRange(b.time_range as string);
      if (r && Date.parse(r.start) <= s && e <= Date.parse(r.end)) return b.id;
    }
    return null;
  };

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
    occupied_range: rangeLiteral(s.startISO, s.occupiedEndISO),
    schedule_block_id: blockForSession(s.startISO, s.occupiedEndISO),
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

  // 患者にメールがあれば確認通知をキューへ
  if (patientId) {
    const { data: pt } = await supabase
      .from("patients")
      .select("email")
      .eq("id", patientId)
      .maybeSingle();
    await enqueueNotification({
      clinicId: clinic.id,
      bookingId: booking.id,
      recipientEmail: pt?.email ?? null,
      recipientType: "patient",
      kind: "booking_confirmed",
    });
  }

  revalidatePath(`/${slug}`);
  return { bookingId: booking.id };
}

const rescheduleSchema = z
  .object({
    bookingId: z.uuid(),
    memberId: z.uuid("担当を選択してください"),
    roomId: z.uuid("部屋を選択してください"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付が不正です"),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻が不正です"),
  })
  .refine((v) => isRealJstDateTime(v.startDate, v.startTime), {
    message: "日付が不正です",
    path: ["startDate"],
  });

// リスケ可能なステータス(来院以降・完了・キャンセルは変更不可)
const RESCHEDULABLE = new Set<BookingStatus>(["requested", "confirmed"]);

// @implements v2-11 予約変更(リスケ): 開始日時 + 担当・部屋の一括変更(全 scheduled セッションに適用)
export async function rescheduleBooking(
  slug: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const { user, clinic } = await requireMember(slug);

  const parsed = rescheduleSchema.safeParse({
    bookingId: formData.get("bookingId"),
    memberId: formData.get("memberId"),
    roomId: formData.get("roomId"),
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const startISO = jstDateTimeToUtcISO(d.startDate, d.startTime);
  if (Date.parse(startISO) < Date.now()) {
    return { error: "過去の日時には変更できません" };
  }

  const supabase = await createClient();

  // 予約ヘッダ + 現行 scheduled セッション(旧値=監査 diff 用)を取得
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "status, service_id, sessions:booking_sessions!booking_sessions_booking_id_fkey(seq, time_range, member_id, room_id, status)",
    )
    .eq("id", d.bookingId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!booking) return { error: "予約が見つかりません" };
  if (!RESCHEDULABLE.has(booking.status as BookingStatus)) {
    return { error: "この予約は変更できません" };
  }

  // メニュー(session_template)取得 + クリニック検証
  const { data: service } = await supabase
    .from("services")
    .select("session_template")
    .eq("id", booking.service_id)
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

  // 新開始時刻からセッションを再配置し、RPC に渡す jsonb を組み立てる
  const laid = layoutSessions(steps, startISO);
  const sessionsPayload = laid.map((s) => ({
    seq: s.seq,
    time_range: rangeLiteral(s.startISO, s.endISO),
    occupied_range: rangeLiteral(s.startISO, s.occupiedEndISO),
  }));

  // 旧値(監査 diff)。scheduled を seq 昇順で並べ先頭を代表値にする。
  const oldScheduled = (booking.sessions ?? [])
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.seq - b.seq);
  const oldStartISO = oldScheduled[0]
    ? (parseRange(oldScheduled[0].time_range as string)?.start ?? null)
    : null;
  const oldMemberId = oldScheduled[0]?.member_id ?? null;
  const oldRoomId = oldScheduled[0]?.room_id ?? null;

  const { error } = await supabase.rpc("reschedule_booking", {
    p_booking_id: d.bookingId,
    p_clinic_id: clinic.id,
    p_expected_status: booking.status,
    p_member_id: d.memberId,
    p_room_id: d.roomId,
    p_sessions: sessionsPayload,
  });
  if (error) {
    if (error.code === "23P01") {
      return { error: "指定の時間帯は部屋または担当が既に埋まっています" };
    }
    if (error.message.includes("status changed")) {
      return { error: "他の操作と競合しました。画面を更新してやり直してください" };
    }
    console.error("[bookings] reschedule failed", error);
    return { error: "予約の変更に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "booking.reschedule",
    targetType: "booking",
    targetId: d.bookingId,
    diff: {
      from: { startISO: oldStartISO, memberId: oldMemberId, roomId: oldRoomId },
      to: { startISO, memberId: d.memberId, roomId: d.roomId },
    },
  });

  // 変更後の内容で患者へ通知(ゲスト予約はゲストメール優先)
  const { data: bk } = await supabase
    .from("bookings")
    .select("guest_email, patient:patients!bookings_patient_id_fkey(email)")
    .eq("id", d.bookingId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  await enqueueNotification({
    clinicId: clinic.id,
    bookingId: d.bookingId,
    recipientEmail: bk?.guest_email ?? bk?.patient?.email ?? null,
    recipientType: "patient",
    kind: "booking_rescheduled",
  });

  revalidatePath(`/${slug}`);
  return { ok: true };
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

  // 楽観ロック: SELECT した status を UPDATE 条件に含め、更新行数で競合を検出する。
  // 同時実行(別の受付が承認/キャンセル)で前提が変わっていたら 0 行になる。
  const { data: updated, error } = await supabase
    .from("bookings")
    .update({ status: parsed.data })
    .eq("id", bookingId)
    .eq("clinic_id", clinic.id)
    .eq("status", current.status)
    .select("id");
  if (error) return { error: "ステータスの更新に失敗しました" };
  if (!updated || updated.length === 0) {
    return { error: "他の操作と競合しました。画面を更新してやり直してください" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "booking.status",
    targetType: "booking",
    targetId: bookingId,
    diff: { from: current.status, to: parsed.data },
  });

  // @implements v2-23 通知(患者)。manual 承認(requested→confirmed)が最も一般的な確定経路。
  // ここで確定メールを積まないと、院内承認した予約の確定通知が患者に届かない。
  if (current.status === "requested" && parsed.data === "confirmed") {
    const { data: bk } = await supabase
      .from("bookings")
      .select("guest_email, patient:patients!bookings_patient_id_fkey(email)")
      .eq("id", bookingId)
      .eq("clinic_id", clinic.id)
      .maybeSingle();
    await enqueueNotification({
      clinicId: clinic.id,
      bookingId,
      recipientEmail: bk?.guest_email ?? bk?.patient?.email ?? null,
      recipientType: "patient",
      kind: "booking_confirmed",
    });
  }

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
  // BC-NEW-03(v2-12): 不来院(no_show)は終端状態。cancelled への遷移を禁止する。
  if (current.status === "no_show") return { error: "不来院の予約はキャンセルできません" };
  if (current.status === "cancelled") return { ok: true };

  // ヘッダの cancelled 更新とセッション解放を単一トランザクション(RPC)で原子的に行う。
  // 分割すると片方失敗で枠(EXCLUDE)がロックされ再予約不能になる(BUG-03)。
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: parsed.data.bookingId,
    p_clinic_id: clinic.id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    // pre-check 後の競合で done になった場合、RPC の done ガードが 'booking % is done' を返す
    if (error.message.includes("is done")) {
      return { error: "完了済みの予約はキャンセルできません" };
    }
    // BC-NEW-03: pre-check 後の競合で no_show になった場合、RPC が 'booking % is no_show' を返す
    if (error.message.includes("is no_show")) {
      return { error: "不来院の予約はキャンセルできません" };
    }
    return { error: "キャンセルに失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "booking.cancel",
    targetType: "booking",
    targetId: parsed.data.bookingId,
    diff: { reason: parsed.data.reason },
  });

  // キャンセル通知(患者/ゲストのメールがあれば)
  const { data: bk } = await supabase
    .from("bookings")
    .select("guest_email, patient:patients!bookings_patient_id_fkey(email)")
    .eq("id", parsed.data.bookingId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  await enqueueNotification({
    clinicId: clinic.id,
    bookingId: parsed.data.bookingId,
    recipientEmail: bk?.guest_email ?? bk?.patient?.email ?? null,
    recipientType: "patient",
    kind: "booking_cancelled",
  });

  revalidatePath(`/${slug}`);
  return { ok: true };
}
