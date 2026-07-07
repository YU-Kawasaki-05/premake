"use client";

// @implements v2-05 セッション構成ビルダー(カウンセリング→施術→リタッチ 等のステップ列)

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDurationMin,
  type SessionStep,
  type SessionStepKind,
  STEP_KIND_LABELS,
  totalDurationMin,
} from "../session-template";

export function SessionBuilder({ initial }: { initial: SessionStep[] }) {
  const [steps, setSteps] = useState<SessionStep[]>(
    initial.length > 0
      ? initial
      : [{ kind: "procedure", label: null, duration_min: 60, buffer_min: 0 }],
  );

  function update(i: number, patch: Partial<SessionStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function add() {
    setSteps((prev) => [
      ...prev,
      { kind: "procedure", label: null, duration_min: 60, buffer_min: 0 },
    ]);
  }
  function remove(i: number) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {/* Server Action へは JSON で渡す */}
      <input type="hidden" name="sessionTemplate" value={JSON.stringify(steps)} />

      {steps.map((step, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 並び順そのものが意味を持つ固定長リスト
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-[var(--paper)] p-2"
        >
          <div className="flex flex-col">
            <button
              type="button"
              aria-label="上へ"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="下へ"
              onClick={() => move(i, 1)}
              disabled={i === steps.length - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              ▼
            </button>
          </div>
          <GripVertical className="size-4 text-[var(--ink-faint)]" aria-hidden />
          <Select
            value={step.kind}
            onValueChange={(v) => update(i, { kind: v as SessionStepKind })}
          >
            <SelectTrigger className="w-32" aria-label="種別">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STEP_KIND_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="表示名(任意)"
            value={step.label ?? ""}
            onChange={(e) => update(i, { label: e.target.value || null })}
            className="w-40"
            aria-label="ステップ表示名"
          />
          <span className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <Input
              type="number"
              min={5}
              max={600}
              value={step.duration_min}
              onChange={(e) => update(i, { duration_min: Number(e.target.value) })}
              className="w-20 tabular-nums"
              aria-label="所要分"
            />
            分
          </span>
          <span className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
            +バッファ
            <Input
              type="number"
              min={0}
              max={240}
              value={step.buffer_min}
              onChange={(e) => update(i, { buffer_min: Number(e.target.value) })}
              className="w-16 tabular-nums"
              aria-label="バッファ分"
            />
            分
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            disabled={steps.length <= 1}
            aria-label="このステップを削除"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" /> ステップを追加
        </Button>
        <span className="text-[12.5px] text-muted-foreground">
          合計 {formatDurationMin(totalDurationMin(steps))}
        </span>
      </div>
    </div>
  );
}
