import type { SessionStep } from "@/features/services/session-template";

export type LaidOutSession = {
  seq: number;
  kind: SessionStep["kind"];
  label: string | null;
  startISO: string;
  /** 施術終了(表示用。time_range の終端) */
  endISO: string;
  /** 施術終了 + バッファ(占有用。occupied_range の終端)。最終ステップのバッファも清掃時間として含める */
  occupiedEndISO: string;
};

/**
 * サービスの session_template を、開始時刻から順に並べて時間を割り当てる。
 * 各ステップは前ステップの占有終了(施術終了+バッファ)から連続して開始する。
 * @param startISO 最初のステップの開始(UTC ISO)
 */
export function layoutSessions(steps: SessionStep[], startISO: string): LaidOutSession[] {
  let cursor = new Date(startISO).getTime();
  return steps.map((step, i) => {
    const start = cursor;
    const end = start + step.duration_min * 60_000;
    const occupiedEnd = end + step.buffer_min * 60_000;
    cursor = occupiedEnd;
    return {
      seq: i + 1,
      kind: step.kind,
      label: step.label,
      startISO: new Date(start).toISOString(),
      endISO: new Date(end).toISOString(),
      occupiedEndISO: new Date(occupiedEnd).toISOString(),
    };
  });
}

/** tstzrange リテラル "[start,end)" を作る */
export function rangeLiteral(startISO: string, endISO: string): string {
  return `[${startISO},${endISO})`;
}
