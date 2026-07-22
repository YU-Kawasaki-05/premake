/**
 * cancel_booking RPC の status ガード検証(BC-NEW-01 / v2-11,14)。
 * done/cancelled をヘッダ UPDATE 条件で弾き、cancelled は冪等成功・done は例外になることを確認する。
 * ローカル Supabase 起動が前提(pnpm test:db)。
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

// 他テストファイルと EXCLUDE 制約が衝突しないよう独立した日付帯を使う
const range = (h1: number, h2: number) =>
  `[2097-06-01T${String(h1).padStart(2, "0")}:00:00+09:00,2097-06-01T${String(h2).padStart(2, "0")}:00:00+09:00)`;

describe.skipIf(!enabled)("cancel_booking の status ガード(BC-NEW-01)", () => {
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

  async function addSession(bookingId: string, h1: number, h2: number) {
    const { error } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: bookingId,
      seq: 1,
      kind: "counseling",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: range(h1, h2),
    });
    expect(error).toBeNull();
  }

  it("(a) confirmed の予約を cancel_booking するとヘッダ・セッションともに cancelled になる", async () => {
    const b = await makeBooking("confirmed");
    await addSession(b, 10, 11);

    const { error } = await admin.rpc("cancel_booking", {
      p_booking_id: b,
      p_clinic_id: CLINIC,
      p_reason: "ガードテスト",
    });
    expect(error).toBeNull();

    const { data: header } = await admin.from("bookings").select("status").eq("id", b).single();
    expect(header?.status).toBe("cancelled");

    const { data: sessions } = await admin
      .from("booking_sessions")
      .select("status")
      .eq("booking_id", b);
    expect(sessions?.length).toBeGreaterThan(0);
    expect(sessions?.every((s) => s.status === "cancelled")).toBe(true);
  });

  it("(b) 既に cancelled の予約に再度 cancel_booking しても例外にならず冪等成功する", async () => {
    const b = await makeBooking("confirmed");
    await addSession(b, 12, 13);

    const { error: e1 } = await admin.rpc("cancel_booking", { p_booking_id: b, p_clinic_id: CLINIC });
    expect(e1).toBeNull();

    // 2 回目: 冪等成功(エラーなし・status は cancelled のまま)
    const { error: e2 } = await admin.rpc("cancel_booking", { p_booking_id: b, p_clinic_id: CLINIC });
    expect(e2).toBeNull();

    const { data } = await admin.from("bookings").select("status").eq("id", b).single();
    expect(data?.status).toBe("cancelled");
  });

  it("(c) done の予約に cancel_booking すると例外になり status は done のまま", async () => {
    const b = await makeBooking("done");

    const { error } = await admin.rpc("cancel_booking", { p_booking_id: b, p_clinic_id: CLINIC });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("is done");

    const { data } = await admin.from("bookings").select("status").eq("id", b).single();
    expect(data?.status).toBe("done"); // ガードで守られ変化しない
  });

  it("(d) 存在しない booking_id はエラーになる", async () => {
    const { error } = await admin.rpc("cancel_booking", {
      p_booking_id: "80000000-0000-4000-a000-0000000000ff",
      p_clinic_id: CLINIC,
    });
    expect(error).not.toBeNull();
  });
});
