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
 * 指定日・サービスの予約可能スロットを算出する(公開予約専用)。
 * open な schedule_blocks のうち、担当可能なスタッフ(在籍中・公開指名対象・当該サービス担当割当あり)
 * かつ有効な部屋の枠に限定し、サービス全体所要時間が収まり、同室・同担当の既存セッションと重ならない
 * 開始時刻を 15 分刻みで列挙する。
 * @implements v2-06 空き枠 / v2-07 担当可否(No.9・No.34・BC-NEW-02)
 * @param nominatedMemberId 指名がある場合そのスタッフの枠に限定
 */
export async function availableSlots(params: {
  clinicId: string;
  serviceId: string;
  service: { session_template: SessionStep[] };
  dateJst: string; // yyyy-mm-dd
  nominatedMemberId?: string | null;
}): Promise<Slot[]> {
  const { clinicId, serviceId, service, dateJst, nominatedMemberId } = params;
  const spanMs = occupiedSpanMin(service.session_template) * 60_000;
  const admin = createAdminClient();

  const dayStartISO = new Date(`${dateJst}T00:00:00+09:00`).toISOString();
  const dayEndISO = new Date(`${dateJst}T23:59:59+09:00`).toISOString();
  const dayRange = `[${dayStartISO},${dayEndISO})`;

  const [
    { data: blocks },
    { data: sessions },
    { data: members },
    { data: assignments },
    { data: activeRooms },
  ] = await Promise.all([
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
    // 公開空き枠に出せるスタッフ = 在籍中(status=active)かつ公開指名対象(is_bookable)
    admin
      .from("clinic_members")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("status", "active")
      .eq("is_bookable", true),
    // 当該サービスを施術できるスタッフ(担当割当)
    admin
      .from("staff_service_assignments")
      .select("member_id")
      .eq("clinic_id", clinicId)
      .eq("service_id", serviceId),
    // 有効な部屋(アーカイブ部屋を除外)
    admin.from("rooms").select("id").eq("clinic_id", clinicId).eq("status", "active"),
  ]);

  // active + is_bookable かつ当該サービス担当のスタッフのみを公開空き枠の対象にする
  const assignedMemberIds = new Set((assignments ?? []).map((a) => a.member_id));
  const eligibleMemberIds = new Set(
    (members ?? []).map((m) => m.id).filter((id) => assignedMemberIds.has(id)),
  );
  const activeRoomIds = new Set((activeRooms ?? []).map((r) => r.id));

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
    if (!eligibleMemberIds.has(block.member_id)) continue;
    if (!activeRoomIds.has(block.room_id)) continue;
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
