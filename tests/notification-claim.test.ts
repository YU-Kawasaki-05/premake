/**
 * 通知送信の排他制御(ROB-03)の DB 層検証。@implements v2-23
 * cron の processQueue が使う「status='queued' 限定の条件付き UPDATE」を直接実行し、
 * 二重クレームが起きないこと・status CHECK が新旧の値を受けることを確認する。
 * ローカル Supabase が起動している場合のみ実行(pnpm test:db)。
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.SUPABASE_DB_TESTS === "1" && !!url && !!serviceKey;

// シード(supabase/seed.sql)の固定 ID
const CLINIC = "10000000-0000-4000-a000-000000000001";

describe.skipIf(!enabled)("notifications の行クレーム(排他制御)", () => {
  // biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
  const admin = createClient(url!, serviceKey!);
  const created: string[] = [];

  const enqueue = async (status = "queued") => {
    const { data, error } = await admin
      .from("notifications")
      .insert({
        clinic_id: CLINIC,
        recipient_type: "patient",
        recipient_email: "claim-test@example.com",
        kind: "reminder",
        status,
      })
      .select("id")
      .single();
    if (data) created.push(data.id);
    return { id: data?.id, error };
  };

  /** processQueue のクレームと同じ条件付き UPDATE。返る行数がそのまま「取得できたか」 */
  const claim = async (id: string) => {
    const { data, error } = await admin
      .from("notifications")
      .update({ status: "sending", sending_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "queued")
      .select("id");
    expect(error).toBeNull();
    return data ?? [];
  };

  afterAll(async () => {
    if (created.length > 0) {
      await admin.from("notifications").delete().in("id", created);
    }
  });

  it("同じ queued 行を 2 回クレームすると 1 回目だけが成功する", async () => {
    const { id, error } = await enqueue();
    expect(error).toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: error が null なら insert 済み
    const target = id!;

    const first = await claim(target);
    expect(first).toHaveLength(1);

    // 2 回目(= 重複起動した cron)は 0 行 → 呼び出し側はスキップする
    const second = await claim(target);
    expect(second).toHaveLength(0);

    const { data: row } = await admin
      .from("notifications")
      .select("status, sending_at")
      .eq("id", target)
      .single();
    expect(row?.status).toBe("sending");
    expect(row?.sending_at).not.toBeNull();
  });

  it("status CHECK は sending を受け付ける", async () => {
    const { error } = await enqueue("sending");
    expect(error).toBeNull();
  });

  it("status CHECK は既存の値(queued/sent/failed)をすべて受け付ける", async () => {
    for (const status of ["queued", "sent", "failed"]) {
      const { error } = await enqueue(status);
      expect(error, `status=${status}`).toBeNull();
    }
  });

  it("status CHECK は未知の値を拒否する", async () => {
    const { error } = await enqueue("bogus");
    expect(error?.code).toBe("23514");
  });

  it("sending のまま古くなった行は queued に戻せる(クラッシュ回復)", async () => {
    const { id, error } = await enqueue("sending");
    expect(error).toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: error が null なら insert 済み
    const target = id!;
    // 11 分前にクレームされた状態を作る
    await admin
      .from("notifications")
      .update({ sending_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() })
      .eq("id", target);

    const { data: recovered } = await admin
      .from("notifications")
      .update({ status: "queued" })
      .eq("status", "sending")
      .lt("sending_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .eq("id", target)
      .select("id");
    expect(recovered).toHaveLength(1);

    // 猶予内(=今クレームされた)行は回収対象にならない
    const fresh = await enqueue("sending");
    // biome-ignore lint/style/noNonNullAssertion: insert 済み
    await admin.from("notifications").update({ sending_at: new Date().toISOString() }).eq("id", fresh.id!);
    const { data: notRecovered } = await admin
      .from("notifications")
      .update({ status: "queued" })
      .eq("status", "sending")
      .lt("sending_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      // biome-ignore lint/style/noNonNullAssertion: insert 済み
      .eq("id", fresh.id!)
      .select("id");
    expect(notRecovered).toHaveLength(0);
  });
});
