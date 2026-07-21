import { ja } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { TIME_ZONE } from "@/lib/datetime";

export type WeekDay = { date: string; label: string; isToday: boolean };

/** anchor(yyyy-mm-dd, JST)を含む週(月曜始まり)の7日を返す */
export function weekDays(anchorDate: string, todayJst: string): WeekDay[] {
  const anchor = new Date(`${anchorDate}T00:00:00+09:00`);
  // JST 上の曜日(月=0 になるよう調整)
  const jstDow = Number(formatInTimeZone(anchor, TIME_ZONE, "i")) - 1; // i: 1(Mon)〜7(Sun)
  const monday = new Date(anchor.getTime() - jstDow * 24 * 60 * 60 * 1000);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 24 * 60 * 60 * 1000);
    const date = formatInTimeZone(d, TIME_ZONE, "yyyy-MM-dd");
    return {
      date,
      label: formatInTimeZone(d, TIME_ZONE, "M/d(EEE)", { locale: ja }),
      isToday: date === todayJst,
    };
  });
}

export function shiftWeek(anchorDate: string, deltaWeeks: number): string {
  const anchor = new Date(`${anchorDate}T00:00:00+09:00`);
  const shifted = new Date(anchor.getTime() + deltaWeeks * 7 * 24 * 60 * 60 * 1000);
  return formatInTimeZone(shifted, TIME_ZONE, "yyyy-MM-dd");
}

/** UTC ISO の時刻を JST の HH:mm で返す */
export function jstTime(iso: string): string {
  // formatInTimeZone は生の UTC インスタントを受けて TZ 変換するため、
  // toZonedTime を通すと二重変換になる(本番 UTC ランタイムで +9h ずれる)
  return formatInTimeZone(new Date(iso), TIME_ZONE, "HH:mm");
}

/** tstzrange 文字列 "[start,end)" から start/end の ISO を抽出 */
export function parseRange(range: string): { start: string; end: string } | null {
  const m = range.match(/^\[?"?([^",]+)"?,\s*"?([^")]+)"?\)?$/);
  if (!m) return null;
  return { start: m[1], end: m[2] };
}
