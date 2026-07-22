import "server-only";

import { parseRange } from "@/features/schedule/week";
import type { SessionStep } from "@/features/services/session-template";
import { createAdminClient } from "@/lib/supabase/admin";

export type Slot = {
  startISO: string;
  memberId: string;
  roomId: string;
};

const STEP_GRANULARITY_MIN = 15;

function occupiedSpanMin(steps: SessionStep[]): number {
  // 占有時間 = 全ステップの施術時間 + バッファ(最終バッファ=清掃時間も含める)。
  // スロット列挙が「バッファ込みで open ブロックに収まる開始時刻」になり、清掃がスタッフ退勤後にはみ出さない。
  return steps.reduce((sum, s) => sum + s.duration_min + s.buffer_min, 0);
}

/**
 * 指定日・サービスの予約可能スロットを算出する。
 * open な schedule_blocks の中で、サービス全体所要時間が収まり、
 * かつ同室・同担当の既存セッションと重ならない開始時刻を 15 分刻みで列挙。
 * @param nominatedMemberId 指名がある場合そのスタッフの枠に限定
 */
export async function availableSlots(params: {
  clinicId: string;
  service: { session_template: SessionStep[] };
  dateJst: string; // yyyy-mm-dd
  nominatedMemberId?: string | null;
}): Promise<Slot[]> {
  const { clinicId, service, dateJst, nominatedMemberId } = params;
  const spanMs = occupiedSpanMin(service.session_template) * 60_000;
  const admin = createAdminClient();

  const dayStartISO = new Date(`${dateJst}T00:00:00+09:00`).toISOString();
  const dayEndISO = new Date(`${dateJst}T23:59:59+09:00`).toISOString();
  const dayRange = `[${dayStartISO},${dayEndISO})`;

  const [{ data: blocks }, { data: sessions }] = await Promise.all([
    admin
      .from("schedule_blocks")
      .select("member_id, room_id, time_range")
      .eq("clinic_id", clinicId)
      .eq("block_type", "open")
      .overlaps("time_range", dayRange),
    admin
      .from("booking_sessions")
      .select("member_id, room_id, occupied_range")
      .eq("clinic_id", clinicId)
      .eq("status", "scheduled")
      .overlaps("occupied_range", dayRange),
  ]);

  const now = Date.now();
  const busy = (sessions ?? [])
    .map((s) => {
      const r = parseRange(s.occupied_range as string);
      return r
        ? {
            memberId: s.member_id,
            roomId: s.room_id,
            start: Date.parse(r.start),
            end: Date.parse(r.end),
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const slots: Slot[] = [];
  const seen = new Set<string>();

  for (const block of blocks ?? []) {
    if (nominatedMemberId && block.member_id !== nominatedMemberId) continue;
    const r = parseRange(block.time_range as string);
    if (!r) continue;
    const blockStart = Date.parse(r.start);
    const blockEnd = Date.parse(r.end);

    for (let t = blockStart; t + spanMs <= blockEnd; t += STEP_GRANULARITY_MIN * 60_000) {
      if (t < now) continue; // 過去は出さない
      const slotEnd = t + spanMs;
      // 同室・同担当の既存予約と重ならないか
      const conflict = busy.some(
        (b) =>
          (b.roomId === block.room_id || b.memberId === block.member_id) &&
          t < b.end &&
          slotEnd > b.start,
      );
      if (conflict) continue;
      const startISO = new Date(t).toISOString();
      const key = `${startISO}-${block.member_id}-${block.room_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push({ startISO, memberId: block.member_id, roomId: block.room_id });
    }
  }

  slots.sort((a, b) => a.startISO.localeCompare(b.startISO));
  return slots;
}
