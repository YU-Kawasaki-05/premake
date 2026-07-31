// @implements v2-21 患者側キャンセル / v2-22 キャンセル期限

/**
 * 患者側キャンセルの受付期限判定。
 * サーバー側の拒否(cancelByToken)と画面側の出し分けで同じ判定を使うための共通実装。
 */
export function isPastCancelDeadline(
  startISO: string | null,
  cancelDeadlineHours: number,
  now: number = Date.now(),
): boolean {
  if (!startISO) return false;
  const start = Date.parse(startISO);
  if (Number.isNaN(start)) return false;
  return start - now < cancelDeadlineHours * 60 * 60 * 1000;
}

/** 期限切れ時の案内文(サーバーのエラーメッセージと画面の案内で共有) */
export function cancelDeadlineMessage(cancelDeadlineHours: number): string {
  return `キャンセル期限(${cancelDeadlineHours}時間前)を過ぎています。クリニックへご連絡ください`;
}
