/**
 * 予約フローの DB 層検証(S3 / v2-10,13,14)。
 * booking_sessions の EXCLUDE 制約が「予約の二重取り」を実際に防ぐことを確認する。
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

const range = (h1: number, h2: number) =>
  `[2099-03-01T${String(h1).padStart(2, "0")}:00:00+09:00,2099-03-01T${String(h2).padStart(2, "0")}:00:00+09:00)`;

describe.skipIf(!enabled)("予約セッションの二重取り防止(EXCLUDE)", () => {
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

  it("同じ部屋・同じ時間帯の2件目セッションは 23P01 で拒否される", async () => {
    const b1 = await makeBooking();
    const { error: e1 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b1,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: range(10, 11),
      occupied_range: range(10, 11),
    });
    expect(e1).toBeNull();

    const b2 = await makeBooking();
    const { error: e2 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b2,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: range(10, 11), // 完全重複
      occupied_range: range(10, 11),
    });
    expect(e2?.code).toBe("23P01");
  });

  it("キャンセル(status=cancelled)にすれば同じ枠を再利用できる", async () => {
    const b1 = await makeBooking();
    const { data: s1, error: e1 } = await admin
      .from("booking_sessions")
      .insert({
        clinic_id: CLINIC,
        booking_id: b1,
        seq: 1,
        kind: "procedure",
        member_id: NURSE_1,
        room_id: ROOM_1,
        time_range: range(14, 15),
        occupied_range: range(14, 15),
      })
      .select("id")
      .single();
    expect(e1).toBeNull();

    // キャンセルすると EXCLUDE の対象外(where status='scheduled')
    // biome-ignore lint/style/noNonNullAssertion: e1 null 検証済み
    await admin.from("booking_sessions").update({ status: "cancelled" }).eq("id", s1!.id);

    const b2 = await makeBooking();
    const { error: e2 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b2,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: range(14, 15),
      occupied_range: range(14, 15),
    });
    expect(e2).toBeNull();
  });

  it("cancel_booking RPC がヘッダとセッションを原子的にキャンセルし枠を解放する(BUG-03)", async () => {
    const b1 = await makeBooking();
    const { error: e1 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b1,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: range(16, 17),
      occupied_range: range(16, 17),
    });
    expect(e1).toBeNull();

    const { error: rpcErr } = await admin.rpc("cancel_booking", {
      p_booking_id: b1,
      p_clinic_id: CLINIC,
      p_reason: "テスト取消",
    });
    expect(rpcErr).toBeNull();

    // ヘッダは cancelled + 理由・時刻が入る
    const { data: header } = await admin
      .from("bookings")
      .select("status, cancel_reason, cancelled_at")
      .eq("id", b1)
      .single();
    expect(header?.status).toBe("cancelled");
    expect(header?.cancel_reason).toBe("テスト取消");
    expect(header?.cancelled_at).not.toBeNull();

    // セッションも cancelled に解放されている(枠ロックが残らない)
    const { data: sessions } = await admin
      .from("booking_sessions")
      .select("status")
      .eq("booking_id", b1);
    expect(sessions?.every((s) => s.status === "cancelled")).toBe(true);

    // 解放された枠を別予約で再取得できる
    const b2 = await makeBooking();
    const { error: e2 } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC,
      booking_id: b2,
      seq: 1,
      kind: "procedure",
      member_id: NURSE_1,
      room_id: ROOM_1,
      time_range: range(16, 17),
      occupied_range: range(16, 17),
    });
    expect(e2).toBeNull();
  });

  it("cancel_booking RPC は他クリニック ID ではロールバックし予約を変更しない(BUG-03 テナント安全性)", async () => {
    const b1 = await makeBooking();
    const { error } = await admin.rpc("cancel_booking", {
      p_booking_id: b1,
      p_clinic_id: "10000000-0000-4000-a000-999999999999", // 存在しない/不一致クリニック
    });
    expect(error).not.toBeNull(); // no_data_found で例外 → トランザクション全体がロールバック

    const { data } = await admin.from("bookings").select("status").eq("id", b1).single();
    expect(data?.status).toBe("confirmed"); // キャンセルされていない
  });

  it("booking_no がトリガ/デフォルトで自動採番される", async () => {
    const b1 = await makeBooking();
    const { data } = await admin.from("bookings").select("booking_no").eq("id", b1).single();
    expect(data?.booking_no).toMatch(/^B-/);
  });
});
