import type { SessionStep } from "@/features/services/session-template";

export type LaidOutSession = {
  seq: number;
  kind: SessionStep["kind"];
  label: string | null;
  startISO: string;
  endISO: string;
};

/**
 * サービスの session_template を、開始時刻から順に並べて時間を割り当てる。
 * 各ステップは前ステップの終了(+バッファ)から連続して開始する。
 * @param startISO 最初のステップの開始(UTC ISO)
 */
export function layoutSessions(steps: SessionStep[], startISO: string): LaidOutSession[] {
  let cursor = new Date(startISO).getTime();
  return steps.map((step, i) => {
    const start = cursor;
    const end = start + step.duration_min * 60_000;
    cursor = end + step.buffer_min * 60_000;
    return {
      seq: i + 1,
      kind: step.kind,
      label: step.label,
      startISO: new Date(start).toISOString(),
      endISO: new Date(end).toISOString(),
    };
  });
}

/** tstzrange リテラル "[start,end)" を作る */
export function rangeLiteral(startISO: string, endISO: string): string {
  return `[${startISO},${endISO})`;
}
