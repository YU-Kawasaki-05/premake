import { describe, expect, it } from "vitest";
import {
  finishReminderCronCheckIn,
  initMonitoring,
  reportRequestError,
  startReminderCronCheckIn,
} from "./monitoring";

// Issue #16: SENTRY_DSN 未設定なら監視は完全に不活性であること。
// 「設定していないのに落ちる・待たされる」状態を作らないための回帰テスト。
describe("monitoring (SENTRY_DSN 未設定)", () => {
  it("初期化しても例外を投げない", async () => {
    await expect(initMonitoring()).resolves.toBeUndefined();
  });

  it("cron チェックインは null を返し、終了通知も no-op", async () => {
    const checkIn = await startReminderCronCheckIn();
    expect(checkIn).toBeNull();
    await expect(finishReminderCronCheckIn(checkIn, "ok")).resolves.toBeUndefined();
    await expect(finishReminderCronCheckIn(checkIn, "error")).resolves.toBeUndefined();
  });

  it("エラー報告は no-op(元のエラーを飲み込むだけで再送出しない)", async () => {
    await expect(
      reportRequestError(
        new Error("boom"),
        { method: "GET" },
        {
          routerKind: "App Router",
          routePath: "/api/cron",
          routeType: "route",
        },
      ),
    ).resolves.toBeUndefined();
  });
});
