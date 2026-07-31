/**
 * recordAudit の実 DB 検証。@implements v2-04
 *
 * #13 の教訓の回帰テスト: supabase-js の insert は失敗を throw せず戻り値で返すため、
 * 戻り値を検査しないと監査が無音で欠落する。ここでは
 *   1. 正常系: 監査行が実際に書かれる
 *   2. 失敗系: insert が失敗しても recordAudit は throw せず(業務を止めない)、
 *      かつ console.error に失敗が表面化する(無音でない)
 * を実測する。ローカル Supabase が起動している場合のみ実行(pnpm test:db)。
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.SUPABASE_DB_TESTS === "1" && !!url && !!serviceKey;

const CLINIC = "10000000-0000-4000-a000-000000000001";
const TEST_ACTION = "test.audit_record";

// recordAudit はリクエストスコープの headers() を使う。テストは Node 直実行のためモックする
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

describe.skipIf(!enabled)("recordAudit(実 DB)", () => {
  // biome-ignore lint/style/noNonNullAssertion: enabled ガード済み
  const admin = createClient(url!, serviceKey!);

  afterAll(async () => {
    await admin.from("audit_logs").delete().eq("action", TEST_ACTION);
  });

  it("正常系: 監査行が書かれる", async () => {
    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({
      clinicId: CLINIC,
      actorType: "system",
      action: TEST_ACTION,
      targetType: "test",
    });
    const { data } = await admin
      .from("audit_logs")
      .select("action, actor_type")
      .eq("action", TEST_ACTION);
    expect(data?.length).toBe(1);
    expect(data?.[0]?.actor_type).toBe("system");
  });

  it("失敗系(#13 の形): insert が失敗しても throw せず、無音でもない", async () => {
    const { recordAudit } = await import("@/lib/audit");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // target_id は uuid 型。#13 と同じ非 UUID 文字列で insert を失敗させる
      await expect(
        recordAudit({
          clinicId: CLINIC,
          actorType: "system",
          action: TEST_ACTION,
          targetType: "test",
          targetId: "member-id:service-id",
        }),
      ).resolves.toBeUndefined();
      // 無音でない: 失敗が console.error に出る(SENTRY_DSN 設定時は Sentry にも飛ぶ)
      expect(errSpy).toHaveBeenCalledWith(
        "[audit] failed to record",
        TEST_ACTION,
        expect.objectContaining({ message: expect.stringContaining("audit insert failed") }),
      );
      // 行は書かれていない(正常系の 1 行のまま)
      const { data } = await admin.from("audit_logs").select("id").eq("action", TEST_ACTION);
      expect(data?.length).toBe(1);
    } finally {
      errSpy.mockRestore();
    }
  });
});
