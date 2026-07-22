/**
 * DB セキュリティ強化(20260722000005)の検証。
 *  - AUTH-1: owner 限定テーブルの RLS write 制限(staff の JWT では owner 操作不可・業務操作は可能)
 *  - DB-N-1: 複合 FK によるクロステナント参照の DB 層遮断
 *  - DB-N-4/5: 非負・非空 CHECK
 *  - 回帰: 単一 FK の cascade が複合 FK(NO ACTION)と共存して壊れていない
 * service role と、seed ユーザーの JWT(anon キー + signInWithPassword)の両方を使う。
 * ローカル Supabase 起動が前提(pnpm test:db)。
 */
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = process.env.SUPABASE_DB_TESTS === "1" && !!url && !!serviceKey && !!anonKey;

// シード(supabase/seed.sql)の固定 ID
const CLINIC = "10000000-0000-4000-a000-000000000001";
const NURSE1_MEMBER = "20000000-0000-4000-a000-000000000002"; // 鈴木(staff / nurse1@demo.local)
const ROOM_1 = "30000000-0000-4000-a000-000000000001";
const SERVICE_PEELING = "60000000-0000-4000-a000-000000000005"; // 単発メニュー(price 16500)
const SERVICE_COUNSELING = "60000000-0000-4000-a000-000000000004";

// このファイル専用の第2クリニック(クロステナント検証用。afterAll で削除)
const CLINIC_B = "1b000000-0000-4000-a000-0000000000b0";
const SERVICE_B = "6b000000-0000-4000-a000-0000000000b0";
const BOOKING_B = "8b000000-0000-4000-a000-0000000000b0";

// 他テストファイルと EXCLUDE 制約が衝突しない独立日付帯(2095 年)を使う
const at = (hhmm: string) => `2095-03-01T${hhmm}:00+09:00`;
const rng = (s: string, e: string) => `[${at(s)},${at(e)})`;

// biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
const admin = createClient(url!, serviceKey!);

async function signIn(email: string): Promise<SupabaseClient> {
  // biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: "premake-dev" });
  expect(error).toBeNull();
  return c;
}

describe.skipIf(!enabled)("DB セキュリティ強化(AUTH-1 / DB-N-1 / DB-N-4/5)", () => {
  let nurse: SupabaseClient;
  let owner: SupabaseClient;
  let peelingOriginalPrice: number;
  const cleanupBookingIds: string[] = [];
  const cleanupPatientIds: string[] = [];

  beforeAll(async () => {
    nurse = await signIn("nurse1@demo.local"); // staff ロール
    owner = await signIn("owner@demo.local"); // owner,doctor ロール
    const { data } = await admin
      .from("services")
      .select("price_yen")
      .eq("id", SERVICE_PEELING)
      .single();
    peelingOriginalPrice = data?.price_yen ?? 16500;
  });

  afterAll(async () => {
    if (cleanupBookingIds.length > 0)
      await admin.from("bookings").delete().in("id", cleanupBookingIds);
    if (cleanupPatientIds.length > 0)
      await admin.from("patients").delete().in("id", cleanupPatientIds);
    await admin.from("bookings").delete().eq("id", BOOKING_B); // sessions は cascade
    await admin.from("services").delete().eq("id", SERVICE_B);
    await admin.from("clinics").delete().eq("id", CLINIC_B);
    await admin.from("services").update({ price_yen: peelingOriginalPrice }).eq("id", SERVICE_PEELING);
  });

  it("(a) AUTH-1: staff JWT の services update は RLS で 0 行、owner JWT では成功する", async () => {
    // staff(nurse1): USING が owner 条件になったため 0 行(エラーなし・不可視更新)
    const { data: nurseRows, error: ne } = await nurse
      .from("services")
      .update({ price_yen: 17000 })
      .eq("id", SERVICE_PEELING)
      .select("id");
    expect(ne).toBeNull();
    expect(nurseRows?.length ?? 0).toBe(0);

    // service role で値が変わっていないことを確認
    const { data: after } = await admin
      .from("services")
      .select("price_yen")
      .eq("id", SERVICE_PEELING)
      .single();
    expect(after?.price_yen).toBe(peelingOriginalPrice);

    // owner: 更新できる(その後 afterAll で元に戻す)
    const { data: ownerRows, error: oe } = await owner
      .from("services")
      .update({ price_yen: peelingOriginalPrice + 1 })
      .eq("id", SERVICE_PEELING)
      .select("id, price_yen");
    expect(oe).toBeNull();
    expect(ownerRows?.length).toBe(1);
    expect(ownerRows?.[0]?.price_yen).toBe(peelingOriginalPrice + 1);
  });

  it("(b) AUTH-1: staff JWT の patients delete は RLS で 0 行(行は残る)", async () => {
    const { data: created, error: ce } = await admin
      .from("patients")
      .insert({ clinic_id: CLINIC, name: "削除テスト患者" })
      .select("id")
      .single();
    expect(ce).toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: 直前で error null を検証済み
    const pid = created!.id;
    cleanupPatientIds.push(pid);

    const { data: deleted, error: de } = await nurse
      .from("patients")
      .delete()
      .eq("id", pid)
      .select("id");
    expect(de).toBeNull();
    expect(deleted?.length ?? 0).toBe(0);

    // service role で行が残存していることを確認
    const { data: still } = await admin.from("patients").select("id").eq("id", pid);
    expect(still?.length).toBe(1);
  });

  it("(c) AUTH-1: staff JWT の bookings insert/update は従来どおり可能", async () => {
    const { data: inserted, error: ie } = await nurse
      .from("bookings")
      .insert({
        clinic_id: CLINIC,
        service_id: SERVICE_COUNSELING,
        guest_name: "業務テスト",
        source: "staff",
      })
      .select("id")
      .single();
    expect(ie).toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: 直前で error null を検証済み
    const bid = inserted!.id;
    cleanupBookingIds.push(bid);

    const { data: updated, error: ue } = await nurse
      .from("bookings")
      .update({ notes: "受付メモ" })
      .eq("id", bid)
      .select("id");
    expect(ue).toBeNull();
    expect(updated?.length).toBe(1);
  });

  it("(d) DB-N-1: 他院(clinic B)から demo の部屋を参照する booking_session は複合 FK で拒否", async () => {
    // 実在する第2クリニックを用意(clinic_id→clinics 単一 FK は通るので、複合 FK だけが発火する状況を作る)
    const { error: ceClinic } = await admin
      .from("clinics")
      .insert({ id: CLINIC_B, slug: "db-sec-test-b", name: "DBセキュリティ検証院B" });
    expect(ceClinic).toBeNull();
    const { error: ceService } = await admin
      .from("services")
      .insert({ id: SERVICE_B, clinic_id: CLINIC_B, name: "B院メニュー" });
    expect(ceService).toBeNull();
    const { error: ceBooking } = await admin
      .from("bookings")
      .insert({ id: BOOKING_B, clinic_id: CLINIC_B, service_id: SERVICE_B, guest_name: "B", source: "staff" });
    expect(ceBooking).toBeNull();

    // clinic=B の予約に、demo の部屋(ROOM_1)を割り当てて占有ロックしようとする → 複合 FK 違反
    const { error } = await admin.from("booking_sessions").insert({
      clinic_id: CLINIC_B,
      booking_id: BOOKING_B,
      seq: 1,
      kind: "procedure",
      room_id: ROOM_1, // demo の部屋(rooms には (ROOM_1, demo) しか無い)
      time_range: rng("10:00", "11:00"),
      occupied_range: rng("10:00", "11:00"),
    });
    expect(error?.code).toBe("23503"); // foreign_key_violation
  });

  it("(e) DB-N-4/5: price_yen=-1 と roles='{}' の update は CHECK 違反で拒否", async () => {
    const { error: priceErr } = await admin
      .from("services")
      .update({ price_yen: -1 })
      .eq("id", SERVICE_PEELING);
    expect(priceErr?.code).toBe("23514"); // check_violation

    const { error: rolesErr } = await admin
      .from("clinic_members")
      .update({ roles: [] })
      .eq("id", NURSE1_MEMBER);
    expect(rolesErr?.code).toBe("23514");
  });

  it("(f) 回帰: bookings 削除で booking_sessions が cascade 削除される(複合 FK と共存)", async () => {
    const { data: booking, error: be } = await admin
      .from("bookings")
      .insert({
        clinic_id: CLINIC,
        service_id: SERVICE_COUNSELING,
        guest_name: "cascade テスト",
        source: "staff",
      })
      .select("id")
      .single();
    expect(be).toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: 直前で error null を検証済み
    const bid = booking!.id;

    const { error: se } = await admin.from("booking_sessions").insert([
      {
        clinic_id: CLINIC,
        booking_id: bid,
        seq: 1,
        kind: "counseling",
        member_id: NURSE1_MEMBER,
        room_id: ROOM_1,
        time_range: rng("13:00", "13:30"),
        occupied_range: rng("13:00", "13:30"),
      },
      {
        clinic_id: CLINIC,
        booking_id: bid,
        seq: 2,
        kind: "procedure",
        member_id: NURSE1_MEMBER,
        room_id: ROOM_1,
        time_range: rng("13:30", "15:00"),
        occupied_range: rng("13:30", "15:15"),
      },
    ]);
    expect(se).toBeNull();

    const { error: de } = await admin.from("bookings").delete().eq("id", bid);
    expect(de).toBeNull();

    const { data: sessions } = await admin
      .from("booking_sessions")
      .select("id")
      .eq("booking_id", bid);
    expect(sessions?.length ?? 0).toBe(0);
  });
});
