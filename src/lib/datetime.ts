import { ja } from "date-fns/locale";
import { format, toZonedTime } from "date-fns-tz";

export const TIME_ZONE = "Asia/Tokyo";

/** JST の日付(yyyy-mm-dd)+時刻(HH:mm)を UTC の ISO 文字列に変換(tstzrange 用) */
export function jstDateTimeToUtcISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

/**
 * 日付のみ: 2026/7/12(金)
 * 日付だけの文字列(`yyyy-mm-dd`)は UTC 00:00 として解釈されるが、JST(+09:00)では同日 09:00 に
 * なるため、JST カレンダー日付としてそのまま渡せる。
 */
export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return format(toZonedTime(d, TIME_ZONE), "yyyy/M/d(EEE)", { timeZone: TIME_ZONE, locale: ja });
}

/** 日付のみ・年なし: 7/12(金)。`yyyy-mm-dd` の扱いは formatDate と同じ */
export function formatDateShort(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return format(toZonedTime(d, TIME_ZONE), "M/d(EEE)", { timeZone: TIME_ZONE, locale: ja });
}

/** 日時: 7/12(金) 13:00 */
export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return format(toZonedTime(d, TIME_ZONE), "M/d(EEE) HH:mm", { timeZone: TIME_ZONE, locale: ja });
}

/** 時間帯: 7/12(金) 13:00–15:30(同日は日付を一度だけ) */
export function formatTimeRange(startISO: string, endISO: string): string {
  const start = toZonedTime(new Date(startISO), TIME_ZONE);
  const end = toZonedTime(new Date(endISO), TIME_ZONE);
  const startStr = format(start, "M/d(EEE) HH:mm", { timeZone: TIME_ZONE, locale: ja });
  const sameDay =
    format(start, "yyyyMMdd", { timeZone: TIME_ZONE }) ===
    format(end, "yyyyMMdd", { timeZone: TIME_ZONE });
  const endStr = format(end, sameDay ? "HH:mm" : "M/d(EEE) HH:mm", {
    timeZone: TIME_ZONE,
    locale: ja,
  });
  return `${startStr}–${endStr}`;
}
