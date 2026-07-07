"use client";

// @implements v2-17 問診質問ビルダー(追加/削除/並べ替え・選択肢編集)

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  needsOptions,
  QUESTION_TYPE_LABELS,
  type Question,
  type QuestionType,
} from "../question-schema";

function newQuestion(): Question {
  return { id: crypto.randomUUID(), type: "text", label: "", required: false };
}

export function QuestionBuilder({ initial }: { initial: Question[] }) {
  const [questions, setQuestions] = useState<Question[]>(
    initial.length > 0 ? initial : [newQuestion()],
  );

  function update(i: number, patch: Partial<Question>) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function add() {
    setQuestions((prev) => [...prev, newQuestion()]);
  }
  function remove(i: number) {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function move(i: number, dir: -1 | 1) {
    setQuestions((prev) => {
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
      <input type="hidden" name="questions" value={JSON.stringify(questions)} />

      {questions.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-md border border-border bg-[var(--paper)] p-3">
          <div className="flex flex-wrap items-center gap-2">
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
                disabled={i === questions.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <span className="w-5 shrink-0 text-center text-[12.5px] text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <Select value={q.type} onValueChange={(v) => update(i, { type: v as QuestionType })}>
              <SelectTrigger className="w-36" aria-label="質問の種類">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(QUESTION_TYPE_LABELS).map(([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="質問文"
              value={q.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="min-w-48 flex-1"
              aria-label="質問文"
            />
            <label
              htmlFor={`q-required-${q.id}`}
              className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
            >
              <Checkbox
                id={`q-required-${q.id}`}
                checked={q.required}
                onCheckedChange={(v) => update(i, { required: v === true })}
              />
              必須
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(i)}
              disabled={questions.length <= 1}
              aria-label="この質問を削除"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {needsOptions(q.type) && (
            <div className="pl-7">
              <Textarea
                placeholder={"選択肢を改行で区切って入力(例: 初めて/経験あり)"}
                value={(q.options ?? []).join("\n")}
                onChange={(e) => update(i, { options: e.target.value.split("\n") })}
                rows={3}
                aria-label="選択肢(改行区切り)"
                className="text-[13px]"
              />
            </div>
          )}
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" /> 質問を追加
      </Button>
    </div>
  );
}
