"use server";

// @implements v2-08 施術枠(schedule_blocks)管理 — スタッフが部屋×時間の枠を確保する

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { jstDateTimeToUtcISO } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export type ScheduleFormState = { error?: string; created?: number };

const DOW = [0, 1, 2, 3, 4, 5, 6] as const;

const createBlockSchema = z.object({
  memberId: z.uuid("担当スタッフを選択してください"),
  roomId: z.uuid("部屋を選択してください"),
  blockType: z.enum(["open", "blocked"]),
  note: z.string().max(200).optional(),
  // 日付(JST, yyyy-mm-dd)と時刻(HH:mm)
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "開始日が不正です"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "開始時刻が不正です"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "終了時刻が不正です"),
  // 繰り返し: 単発なら空。曜日指定 + 終了日
  repeatUntil: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  repeatDows: z.array(z.number().int().min(0).max(6)).optional(),
});

/** startDate から repeatUntil まで、指定曜日(なければ startDate の曜日)の日付を列挙(JST基準) */
function enumerateDates(
  startDate: string,
  repeatUntil: string | undefined,
  dows: number[],
): string[] {
  if (!repeatUntil) return [startDate];
  const start = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${repeatUntil}T00:00:00+09:00`);
  if (end < start) return [startDate];
  const targetDows = dows.length > 0 ? dows : [start.getUTCDay()];
  const out: string[] = [];
  // 最大 366 日で打ち切り(暴走防止)
  for (let d = new Date(start), i = 0; d <= end && i < 366; d.setUTCDate(d.getUTCDate() + 1), i++) {
    // JST の曜日 = そのローカル日付。start は +09:00 起点なので getUTCDay が JST 曜日に一致
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    if (targetDows.includes(jst.getUTCDay())) {
      out.push(jst.toISOString().slice(0, 10));
    }
  }
  return out;
}

export async function createScheduleBlocks(
  slug: string,
  _prev: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const { user, clinic, member } = await requireMember(slug);

  const parsed = createBlockSchema.safeParse({
    memberId: formData.get("memberId"),
    roomId: formData.get("roomId"),
    blockType: formData.get("blockType") ?? "open",
    note: formData.get("note") || undefined,
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    repeatUntil: formData.get("repeatUntil") || undefined,
    repeatDows: DOW.filter((d) => formData.get(`dow-${d}`) === "on"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;
  if (d.startTime >= d.endTime) {
    return { error: "終了時刻は開始時刻より後にしてください" };
  }

  // 権限: staff は自分の枠のみ登録可。owner は誰の枠でも可。
  const isOwner = member.roles.includes("owner");
  if (!isOwner && d.memberId !== member.id) {
    return { error: "自分の施術枠のみ登録できます" };
  }

  const supabase = await createClient();

  // 対象 member と room がこのクリニックのものか検証(越境防止)
  const [{ data: targetMember }, { data: room }] = await Promise.all([
    supabase
      .from("clinic_members")
      .select("id")
      .eq("id", d.memberId)
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
    supabase.from("rooms").select("id").eq("id", d.roomId).eq("clinic_id", clinic.id).maybeSingle(),
  ]);
  if (!targetMember) return { error: "担当スタッフが見つかりません" };
  if (!room) return { error: "部屋が見つかりません" };

  const dates = enumerateDates(d.startDate, d.repeatUntil, d.repeatDows ?? []);
  const rows = dates.map((date) => ({
    clinic_id: clinic.id,
    member_id: d.memberId,
    room_id: d.roomId,
    block_type: d.blockType,
    note: d.note || null,
    created_by: user.id,
    time_range: `[${jstDateTimeToUtcISO(date, d.startTime)},${jstDateTimeToUtcISO(date, d.endTime)})`,
  }));

  // EXCLUDE 制約で重複はエラーになる。1件ずつ入れ、重複はスキップして件数を数える。
  let created = 0;
  let conflicts = 0;
  for (const row of rows) {
    const { error } = await supabase.from("schedule_blocks").insert(row);
    if (error) {
      if (error.code === "23P01") {
        conflicts++;
      } else {
        console.error("[schedule] insert failed", error);
        return { error: "施術枠の登録に失敗しました" };
      }
    } else {
      created++;
    }
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "schedule_block.create",
    diff: { created, conflicts, member_id: d.memberId, room_id: d.roomId },
  });
  revalidatePath(`/${slug}/schedule`);
  return {
    created,
    error:
      conflicts > 0
        ? `${created}件を登録(${conflicts}件は既存の枠と重複のためスキップ)`
        : undefined,
  };
}

export async function deleteScheduleBlock(slug: string, blockId: string) {
  const { user, clinic, member } = await requireMember(slug);
  const supabase = await createClient();

  const { data: block } = await supabase
    .from("schedule_blocks")
    .select("id, member_id")
    .eq("id", blockId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!block) return { error: "施術枠が見つかりません" };

  const isOwner = member.roles.includes("owner");
  if (!isOwner && block.member_id !== member.id) {
    return { error: "自分の施術枠のみ削除できます" };
  }

  // 予約(booking_sessions)が紐づく枠は削除させない
  const { count } = await supabase
    .from("booking_sessions")
    .select("id", { count: "exact", head: true })
    .eq("schedule_block_id", blockId)
    .eq("status", "scheduled");
  if ((count ?? 0) > 0) {
    return { error: "この枠には予約が入っているため削除できません" };
  }

  const { error } = await supabase
    .from("schedule_blocks")
    .delete()
    .eq("id", blockId)
    .eq("clinic_id", clinic.id);
  if (error) return { error: "削除に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "schedule_block.delete",
    targetType: "schedule_block",
    targetId: blockId,
  });
  revalidatePath(`/${slug}/schedule`);
  return {};
}
