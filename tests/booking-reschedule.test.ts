/**
 * reschedule_booking RPC の検証(No.1 [B] / v2-11)。
 * DEFERRABLE 化した EXCLUDE を Tx 内で deferred にし、
 *  (a) 同一予約の複数セッションを 30 分シフト(自己衝突パターン)しても成功する
 *  (b) 他予約が占有する時間帯へのリスケは 23P01 で全ロールバックされる(旧値のまま)
 *  (c) p_expected_status 不一致(競合)は 'status changed' 例外になる
 *  (d) 担当・部屋の変更が全 scheduled セッションに反映される
 * を確認する。ローカル Supabase 起動が前提(pnpm test:db)。
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.SUPABASE_DB_TESTS === "1" && !!url && !!serviceKey;

// シード(supabase/seed.sql)の固定 ID
const CLINIC = "10000000-0000-4000-a000-000000000001";
const NURSE_1 = "20000000-0000-4000-a000-000000000002";
const NURSE_2 = "20000000-0000-4000-a000-000000000003";
const ROOM_1 = "30000000-0000-4000-a000-000000000001";
const ROOM_2 = "30000000-0000-4000-a000-000000000002";
const SERVICE_COUNSELING = "60000000-0000-4000-a000-000000000004";
const PATIENT_1 = "70000000-0000-4000-a000-000000000001";

// 他テストファイルと EXCLUDE 制約が衝突しない独立した日付帯を使う
const D = "2099-04-01";
const jst = (hhmm: string) => `${D}T${hhmm}:00+09:00`;
const range = (s: string, e: string) => `[${jst(s)},${jst(e)})`;
const epoch = (hhmm: string) => new Date(jst(hhmm)).getTime();

/** tstzrange 文字列の下限・上限を epoch(ms)で返す */
function bounds(rangeStr: string): { start: number; end: number } {
  const m = rangeStr.match(/^\[?"?([^",]+)"?,\s*"?([^")]+)"?\)?$/);
  if (!m) throw new Error(`unparsable range: ${rangeStr}`);
  return { start: new Date(m[1]).getTime(), end: new Date(m[2]).getTime() };
}

describe.skipIf(!enabled)("reschedule_booking(v2-11 リスケ)", () => {
  // biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
  const admin = createClient(url!, serviceKey!);
  const bookingIds: string[] = [];

  afterAll(async () => {
    if (bookingIds.length > 0) await admin.from("bookings").delete().in("id", bookingIds);
  });

  async function makeBooking(status: string) {
    const { data, error } = await admin
      .from("bookings")
      .insert({
        clinic_id: CLINIC,
        patient_id: PATIENT_1,
        service_id: SERVICE_COUNSELING,
        status,
        source: "staff",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: 直前で error null を検証済み
    bookingIds.push(data!.id);
    // biome-ignore lint/style/noNonNullAssertion: 同上
    return data!.id;
  }

  async function addSession(
    bookingId: string,
    seq: number,
    memberId: string,
    roomId: string,
    tr: string,
    occ: string,
  ) {
    const { error } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: bookingId,
      seq,
      kind: "procedure",
      member_id: memberId,
      room_id: roomId,
      time_range: tr,
      occupied_range: occ,
    });
    expect(error).toBeNull();
  }

  async function sessionsOf(bookingId: string) {
    const { data } = await admin
      .from("booking_sessions")
      .select("seq, member_id, room_id, time_range, occupied_range, status")
      .eq("booking_id", bookingId)
      .order("seq");
    return data ?? [];
  }

  it("(a) 2 セッション予約を 30 分後ろへシフト(自己衝突パターン)しても成功し新値になる", async () => {
    // s1 10:00–10:30(buffer 0) / s2 10:30–12:30(buffer 15 → 占有 12:45)。同室・同担当。
    const b = await makeBooking("confirmed");
    await addSession(b, 1, NURSE_1, ROOM_1, range("10:00", "10:30"), range("10:00", "10:30"));
    await addSession(b, 2, NURSE_1, ROOM_1, range("10:30", "12:30"), range("10:30", "12:45"));

    // 30 分後ろへ。s1 新枠 10:30–11:00 は s2 旧占有 10:30–12:45 と重なる(即時評価なら 23P01)。
    const { error } = await admin.rpc("reschedule_booking", {
      p_booking_id: b,
      p_clinic_id: CLINIC,
      p_expected_status: "confirmed",
      p_member_id: NURSE_1,
      p_room_id: ROOM_1,
      p_sessions: [
        { seq: 1, time_range: range("10:30", "11:00"), occupied_range: range("10:30", "11:00") },
        { seq: 2, time_range: range("11:00", "13:00"), occupied_range: range("11:00", "13:15") },
      ],
    });
    expect(error).toBeNull();

    const s = await sessionsOf(b);
    expect(s.length).toBe(2);
    expect(bounds(s[0].time_range).start).toBe(epoch("10:30"));
    expect(bounds(s[0].time_range).end).toBe(epoch("11:00"));
    expect(bounds(s[1].time_range).start).toBe(epoch("11:00"));
    expect(bounds(s[1].time_range).end).toBe(epoch("13:00"));
    expect(bounds(s[1].occupied_range).end).toBe(epoch("13:15"));
  });

  it("(b) 他予約が占有する時間帯へのリスケは 23P01 で全ロールバック(旧値のまま)", async () => {
    // 占有側: 14:00–15:00 room1/nurse1
    const occupier = await makeBooking("confirmed");
    await addSession(occupier, 1, NURSE_1, ROOM_1, range("14:00", "15:00"), range("14:00", "15:00"));

    // 変更対象: 元は 08:00–09:00。14:00–15:00(同室・同担当)へ移そうとして衝突させる。
    const target = await makeBooking("confirmed");
    await addSession(target, 1, NURSE_1, ROOM_1, range("08:00", "09:00"), range("08:00", "09:00"));

    const { error } = await admin.rpc("reschedule_booking", {
      p_booking_id: target,
      p_clinic_id: CLINIC,
      p_expected_status: "confirmed",
      p_member_id: NURSE_1,
      p_room_id: ROOM_1,
      p_sessions: [
        { seq: 1, time_range: range("14:00", "15:00"), occupied_range: range("14:00", "15:00") },
      ],
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23P01");

    // 全ロールバック: 対象は旧値 08:00–09:00 のまま
    const s = await sessionsOf(target);
    expect(bounds(s[0].time_range).start).toBe(epoch("08:00"));
    expect(bounds(s[0].time_range).end).toBe(epoch("09:00"));
  });

  it("(c) p_expected_status 不一致(done を confirmed 期待)は 'status changed' 例外", async () => {
    const b = await makeBooking("done");
    await addSession(b, 1, NURSE_1, ROOM_1, range("16:00", "17:00"), range("16:00", "17:00"));

    const { error } = await admin.rpc("reschedule_booking", {
      p_booking_id: b,
      p_clinic_id: CLINIC,
      p_expected_status: "confirmed",
      p_member_id: NURSE_1,
      p_room_id: ROOM_1,
      p_sessions: [
        { seq: 1, time_range: range("18:00", "19:00"), occupied_range: range("18:00", "19:00") },
      ],
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("status changed");

    // セッションは変更されない
    const s = await sessionsOf(b);
    expect(bounds(s[0].time_range).start).toBe(epoch("16:00"));
  });

  it("(d) 担当・部屋の変更が全 scheduled セッションに反映される", async () => {
    // 初期は room1/nurse1 の空き枠(17時台)。最終で room2/nurse2 へ移す。
    const b = await makeBooking("confirmed");
    await addSession(b, 1, NURSE_1, ROOM_1, range("17:00", "17:30"), range("17:00", "17:30"));
    await addSession(b, 2, NURSE_1, ROOM_1, range("17:30", "18:30"), range("17:30", "18:45"));

    const { error } = await admin.rpc("reschedule_booking", {
      p_booking_id: b,
      p_clinic_id: CLINIC,
      p_expected_status: "confirmed",
      p_member_id: NURSE_2,
      p_room_id: ROOM_2,
      p_sessions: [
        { seq: 1, time_range: range("20:00", "20:30"), occupied_range: range("20:00", "20:30") },
        { seq: 2, time_range: range("20:30", "21:30"), occupied_range: range("20:30", "21:45") },
      ],
    });
    expect(error).toBeNull();

    const s = await sessionsOf(b);
    expect(s.length).toBe(2);
    expect(s.every((r) => r.member_id === NURSE_2)).toBe(true);
    expect(s.every((r) => r.room_id === ROOM_2)).toBe(true);
    expect(bounds(s[0].time_range).start).toBe(epoch("20:00"));
    expect(bounds(s[1].time_range).end).toBe(epoch("21:30"));
  });
});
