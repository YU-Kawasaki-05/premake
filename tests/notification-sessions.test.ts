/**
 * pickNotificationSessions の純関数テスト(NT-NEW-2)。
 * DB 不要。キャンセルメールで「日時未定」にならないための選択ロジックを検証する。
 */
import { describe, expect, it } from "vitest";
import { pickNotificationSessions } from "@/features/notifications/select-sessions";

type S = { time_range: string; status: string; seq: number };

const s = (seq: number, status: string): S => ({
  seq,
  status,
  time_range: `[2099-03-0${seq}T10:00:00+09:00,2099-03-0${seq}T11:00:00+09:00)`,
});

describe("pickNotificationSessions", () => {
  it("(a) 通常 kind は scheduled のみを返す(cancelled/done は除外)", () => {
    const sessions: S[] = [s(1, "scheduled"), s(2, "cancelled"), s(3, "done")];
    const picked = pickNotificationSessions("reminder", sessions);
    expect(picked.map((x) => x.seq)).toEqual([1]);
    expect(picked.every((x) => x.status === "scheduled")).toBe(true);
  });

  it("(b) booking_cancelled は全て cancelled のとき cancelled を返す", () => {
    const sessions: S[] = [s(1, "cancelled"), s(2, "cancelled")];
    const picked = pickNotificationSessions("booking_cancelled", sessions);
    expect(picked.map((x) => x.seq)).toEqual([1, 2]);
    expect(picked.every((x) => x.status === "cancelled")).toBe(true);
  });

  it("(c) booking_cancelled は scheduled が残っていれば scheduled を優先する", () => {
    const sessions: S[] = [s(1, "cancelled"), s(2, "scheduled")];
    const picked = pickNotificationSessions("booking_cancelled", sessions);
    expect(picked.map((x) => x.seq)).toEqual([2]);
    expect(picked.every((x) => x.status === "scheduled")).toBe(true);
  });

  it("(d) seq 昇順にソートして返す", () => {
    const sessions: S[] = [s(3, "cancelled"), s(1, "cancelled"), s(2, "cancelled")];
    const picked = pickNotificationSessions("booking_cancelled", sessions);
    expect(picked.map((x) => x.seq)).toEqual([1, 2, 3]);
  });

  it("(e) 空配列は空配列を返す", () => {
    expect(pickNotificationSessions("reminder", [])).toEqual([]);
    expect(pickNotificationSessions("booking_cancelled", [])).toEqual([]);
  });

  it("done しか無い booking_cancelled は空(done は対象外)", () => {
    const sessions: S[] = [s(1, "done")];
    expect(pickNotificationSessions("booking_cancelled", sessions)).toEqual([]);
  });

  it("booking_cancelled_internal も全 cancelled のとき cancelled を返す(No.22)", () => {
    const sessions: S[] = [s(1, "cancelled"), s(2, "cancelled")];
    const picked = pickNotificationSessions("booking_cancelled_internal", sessions);
    expect(picked.map((x) => x.seq)).toEqual([1, 2]);
  });
});
