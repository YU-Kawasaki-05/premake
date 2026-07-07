"use client";

import { Check } from "lucide-react";

export function SavedNote({ saved }: { saved?: boolean }) {
  if (!saved) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] text-[var(--status-confirmed)]">
      <Check className="size-3.5" aria-hidden />
      保存しました
    </span>
  );
}
