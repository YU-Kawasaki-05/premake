/**
 * バッファ占有(occupied_range)の DB 層検証(台帳 No.33 / v2-05)。
 * time_range=施術時間・occupied_range=施術+バッファ とし、
 *  (a) 施術終了ちょうど(バッファ内)の同室予約は EXCLUDE 23P01 で拒否される
 *  (b) バッファ終了以降の開始は成功する
 *  (c) time_range <@ occupied_range の CHECK 違反は拒否される
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
const ROOM_1 = "30000000-0000-4000-a000-000000000001";
const SERVICE_COUNSELING = "60000000-0000-4000-a000-000000000004"; // カウンセリングのみ
const PATIENT_1 = "70000000-0000-4000-a000-000000000001";

// 他テストファイルと EXCLUDE 制約が衝突しない独立した日付帯を使う
const at = (hhmm: string) => `2098-05-01T${hhmm}:00+09:00`;
const rng = (startHhmm: string, endHhmm: string) => `[${at(startHhmm)},${at(endHhmm)})`;

describe.skipIf(!enabled)("バッファ占有(occupied_range)の重複防止と CHECK", () => {
  // biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
  const admin = createClient(url!, serviceKey!);
  const bookingIds: string[] = [];

  afterAll(async () => {
    if (bookingIds.length > 0) await admin.from("bookings").delete().in("id", bookingIds);
  });

  async function makeBooking() {
    const { data, error } = await admin
      .from("bookings")
      .insert({
        clinic_id: CLINIC,
        patient_id: PATIENT_1,
        service_id: SERVICE_COUNSELING,
        status: "confirmed",
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

  it("(a) 施術終了ちょうど(バッファ内)に始まる同室予約は 23P01 で拒否される", async () => {
    // booking1: 施術 10:00–12:00、バッファ 15 分 → 占有 10:00–12:15
    const b1 = await makeBooking();
    const { error: e1 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b1,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: rng("10:00", "12:00"),
      occupied_range: rng("10:00", "12:15"),
    });
    expect(e1).toBeNull();

    // booking2: 施術終了ちょうど 12:00 開始。占有 12:00–13:00 は booking1 占有 12:15 と重なる
    const b2 = await makeBooking();
    const { error: e2 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b2,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: rng("12:00", "13:00"),
      occupied_range: rng("12:00", "13:00"),
    });
    expect(e2?.code).toBe("23P01");
  });

  it("(b) バッファ終了以降(12:15)に始まる予約は成功する", async () => {
    // booking1 の占有終了 12:15 と隣接(境界一致は重複ではない)
    const b3 = await makeBooking();
    const { error: e3 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b3,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: rng("12:15", "13:15"),
      occupied_range: rng("12:15", "13:15"),
    });
    expect(e3).toBeNull();
  });

  it("(c) time_range が occupied_range に包含されない insert は CHECK 違反で拒否される", async () => {
    const b4 = await makeBooking();
    const { error: e4 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b4,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: rng("14:00", "15:00"), // 施術がバッファ込み占有をはみ出す(不正)
      occupied_range: rng("14:00", "14:30"),
    });
    expect(e4).not.toBeNull();
    expect(e4?.code).toBe("23514"); // check_violation
  });
});
