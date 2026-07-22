/**
 * ダブルブッキング防止の DB 層(EXCLUDE 制約)の検証。@implements v2-13
 * ローカル Supabase が起動している場合のみ実行(pnpm test:db)。
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

// シードデータと衝突しない遠未来の時間帯を使う
const range = (startHour: number, endHour: number) =>
  `[2099-01-01T${String(startHour).padStart(2, "0")}:00:00+09:00,2099-01-01T${String(endHour).padStart(2, "0")}:00:00+09:00)`;

describe.skipIf(!enabled)("schedule_blocks の EXCLUDE 制約", () => {
  // biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
  const admin = createClient(url!, serviceKey!);
  const created: string[] = [];

  afterAll(async () => {
    if (created.length > 0) {
      await admin.from("schedule_blocks").delete().in("id", created);
    }
  });

  it("同一部屋・時間重複の枠は 23P01 で拒否される", async () => {
    const { data: first, error: e1 } = await admin
      .from("schedule_blocks")
      .insert({
        clinic_id: CLINIC,
        member_id: NURSE_1,
        room_id: ROOM_1,
        time_range: range(10, 12),
      })
      .select("id")
      .single();
    expect(e1).toBeNull();
    if (first) created.push(first.id);

    const { error: e2 } = await admin.from("schedule_blocks").insert({
      clinic_id: CLINIC,
      member_id: NURSE_2, // 別スタッフでも部屋が同じなら拒否
      room_id: ROOM_1,
      time_range: range(11, 13),
    });
    expect(e2?.code).toBe("23P01");
  });

  it("同一スタッフ・時間重複は部屋が違っても拒否される", async () => {
    const { error } = await admin.from("schedule_blocks").insert({
      clinic_id: CLINIC,
      member_id: NURSE_1, // ↑のテストで 10-12 を確保済み
      room_id: ROOM_2,
      time_range: range(11, 14),
    });
    expect(error?.code).toBe("23P01");
  });

  it("隣接(境界一致)は重複ではない", async () => {
    const { data, error } = await admin
      .from("schedule_blocks")
      .insert({
        clinic_id: CLINIC,
        member_id: NURSE_1,
        room_id: ROOM_1,
        time_range: range(12, 14), // 10-12 の直後
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data) created.push(data.id);
  });
});

describe.skipIf(!enabled)("booking_sessions の EXCLUDE 制約", () => {
  // biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
  const admin = createClient(url!, serviceKey!);
  let bookingId: string | undefined;

  afterAll(async () => {
    if (bookingId) {
      await admin.from("bookings").delete().eq("id", bookingId); // sessions は cascade
    }
  });

  it("キャンセル済みセッションの時間帯は再利用できる", async () => {
    const { data: booking, error: eb } = await admin
      .from("bookings")
      .insert({
        clinic_id: CLINIC,
        service_id: "60000000-0000-4000-a000-000000000004",
        guest_name: "制約 テスト",
        source: "staff",
      })
      .select("id")
      .single();
    expect(eb).toBeNull();
    bookingId = booking?.id;

    const base = {
      clinic_id: CLINIC,
      booking_id: bookingId,
      member_id: NURSE_2,
      room_id: ROOM_2,
      time_range: range(15, 16),
      occupied_range: range(15, 16),
    };

    const { data: s1, error: e1 } = await admin
      .from("booking_sessions")
      .insert({ ...base, seq: 1 })
      .select("id")
      .single();
    expect(e1).toBeNull();

    // 同時間帯は拒否
    const { error: e2 } = await admin.from("booking_sessions").insert({ ...base, seq: 2 });
    expect(e2?.code).toBe("23P01");

    // キャンセル後は同時間帯に入れられる
    // biome-ignore lint/style/noNonNullAssertion: e1 が null なら存在
    await admin.from("booking_sessions").update({ status: "cancelled" }).eq("id", s1!.id);
    const { error: e3 } = await admin.from("booking_sessions").insert({ ...base, seq: 3 });
    expect(e3).toBeNull();
  });
});
