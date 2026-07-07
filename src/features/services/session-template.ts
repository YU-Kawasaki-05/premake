export type SessionStepKind = "counseling" | "procedure" | "retouch" | "other";

export type SessionStep = {
  kind: SessionStepKind;
  label: string | null;
  duration_min: number;
  buffer_min: number;
};

export const STEP_KIND_LABELS: Record<SessionStepKind, string> = {
  counseling: "カウンセリング",
  procedure: "施術",
  retouch: "リタッチ",
  other: "その他",
};

export const DEFAULT_SESSION_TEMPLATE: SessionStep[] = [
  { kind: "procedure", label: null, duration_min: 60, buffer_min: 0 },
];

/** セッション構成の合計所要時間(バッファ込み)を分で返す */
export function totalDurationMin(steps: SessionStep[]): number {
  return steps.reduce((sum, s) => sum + s.duration_min + s.buffer_min, 0);
}

export function formatDurationMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}
