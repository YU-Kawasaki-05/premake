// @implements v2-23 通知(本文の日時算出に使うセッション選択)

import type { NotificationKind } from "./templates";

/**
 * 通知本文の日時算出に使うセッションを選ぶ純関数。
 *
 * - 通常 kind: status='scheduled' のみを seq 昇順で返す(従来挙動)
 * - kind='booking_cancelled': scheduled があれば scheduled を優先し、
 *   無ければ status='cancelled' のセッションを seq 昇順で返す。
 *   キャンセル後は cancel_booking RPC が全セッションを cancelled にするため、
 *   scheduled 限定だと日時が算出できず本文が「日時未定」になる(NT-NEW-2)。
 *   キャンセル済みでも元の予約日時をメールに出せるよう cancelled を採用する。
 * - 'done' セッションはどの kind でも対象外のまま。
 *
 * time_range 等の追加フィールドはそのまま透過して返す(選択は status/seq のみで行う)。
 */
export function pickNotificationSessions<T extends { status: string; seq: number }>(
  kind: NotificationKind,
  sessions: readonly T[],
): T[] {
  const bySeq = (a: T, b: T) => a.seq - b.seq;
  const scheduled = sessions.filter((s) => s.status === "scheduled").sort(bySeq);
  if (kind === "booking_cancelled" && scheduled.length === 0) {
    return sessions.filter((s) => s.status === "cancelled").sort(bySeq);
  }
  return scheduled;
}
