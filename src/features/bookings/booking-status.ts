export type BookingStatus =
  | "requested"
  | "confirmed"
  | "checked_in"
  | "done"
  | "cancelled"
  | "no_show";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: "承認待ち",
  confirmed: "確定",
  checked_in: "来院",
  done: "完了",
  cancelled: "キャンセル",
  no_show: "無断",
};

/** ステータス → CSS 変数(globals.css の --status-*) */
export const BOOKING_STATUS_STYLE: Record<BookingStatus, { color: string; bg: string }> = {
  requested: { color: "var(--status-requested)", bg: "var(--status-requested-bg)" },
  confirmed: { color: "var(--status-confirmed)", bg: "var(--status-confirmed-bg)" },
  checked_in: { color: "var(--status-checked-in)", bg: "var(--status-checked-in-bg)" },
  done: { color: "var(--status-done)", bg: "var(--status-done-bg)" },
  cancelled: { color: "var(--status-cancelled)", bg: "var(--surface)" },
  no_show: { color: "var(--status-no-show)", bg: "var(--status-no-show-bg)" },
};

/** 現在ステータスから遷移可能な次ステータス(院内オペ) */
export function nextStatuses(status: BookingStatus): BookingStatus[] {
  switch (status) {
    case "requested":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["checked_in", "no_show", "cancelled"];
    case "checked_in":
      return ["done", "cancelled"];
    default:
      return [];
  }
}

/** UTC ISO → その日の JST 分(0-1439) */
export function jstMinutesOfDay(iso: string): number {
  const jstMs = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  return Math.floor(jstMs / 60000) % 1440;
}

export function jstHhmm(iso: string): string {
  const m = jstMinutesOfDay(iso);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
