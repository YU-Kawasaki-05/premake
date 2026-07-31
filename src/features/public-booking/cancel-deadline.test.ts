import { describe, expect, it } from "vitest";
import { cancelDeadlineMessage, isPastCancelDeadline } from "./cancel-deadline";

const now = Date.parse("2026-07-31T00:00:00Z");
const hoursLater = (h: number) => new Date(now + h * 60 * 60 * 1000).toISOString();

describe("isPastCancelDeadline", () => {
  it("期限より前(48 時間後の予約 / 期限 24 時間前)は false", () => {
    expect(isPastCancelDeadline(hoursLater(48), 24, now)).toBe(false);
  });

  it("期限を過ぎた予約(2 時間後 / 期限 24 時間前)は true", () => {
    expect(isPastCancelDeadline(hoursLater(2), 24, now)).toBe(true);
  });

  it("ちょうど期限の境界(24 時間後)はまだキャンセルできる", () => {
    expect(isPastCancelDeadline(hoursLater(24), 24, now)).toBe(false);
  });

  it("開始時刻が不明な場合は期限判定しない(サーバー側と同じ扱い)", () => {
    expect(isPastCancelDeadline(null, 24, now)).toBe(false);
    expect(isPastCancelDeadline("not-a-date", 24, now)).toBe(false);
  });

  it("期限 0 時間なら開始時刻を過ぎるまでキャンセルできる", () => {
    expect(isPastCancelDeadline(hoursLater(0.5), 0, now)).toBe(false);
    expect(isPastCancelDeadline(hoursLater(-0.5), 0, now)).toBe(true);
  });
});

describe("cancelDeadlineMessage", () => {
  it("クリニック設定の期限時間を含む", () => {
    expect(cancelDeadlineMessage(24)).toBe(
      "キャンセル期限(24時間前)を過ぎています。クリニックへご連絡ください",
    );
  });
});
