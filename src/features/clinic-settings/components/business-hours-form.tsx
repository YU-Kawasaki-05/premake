"use client";

// @implements v2-03 営業時間(曜日別)

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormError } from "@/features/auth/components/form-error";
import { type SettingsFormState, updateBusinessHours } from "@/features/clinic-settings/actions";
import { type BusinessHour, DOW_LABELS } from "@/features/clinic-settings/types";
import { SavedNote } from "./saved-note";

export function BusinessHoursForm({ slug, defaults }: { slug: string; defaults: BusinessHour[] }) {
  const boundAction = updateBusinessHours.bind(null, slug);
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(boundAction, {});

  const byDow = new Map(defaults.map((h) => [h.dow, h]));
  const [closedDows, setClosedDows] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3, 4, 5, 6].filter((dow) => !byDow.has(dow))),
  );

  function toggleClosed(dow: number, closed: boolean) {
    setClosedDows((prev) => {
      const next = new Set(prev);
      if (closed) next.add(dow);
      else next.delete(dow);
      return next;
    });
  }

  return (
    <form action={action} className="mt-4 space-y-4">
      <div className="space-y-2">
        {DOW_LABELS.map((label, dow) => {
          const closed = closedDows.has(dow);
          const hour = byDow.get(dow);
          return (
            <div key={label} className="flex items-center gap-3 text-sm">
              <span className="w-6 text-center font-medium">{label}</span>
              <span className="flex w-16 items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Checkbox
                  id={`closed-${dow}`}
                  name={`closed-${dow}`}
                  checked={closed}
                  onCheckedChange={(v) => toggleClosed(dow, v === true)}
                  aria-label={`${label}曜を休診にする`}
                />
                <label htmlFor={`closed-${dow}`}>休診</label>
              </span>
              <Input
                type="time"
                name={`open-${dow}`}
                defaultValue={hour?.open ?? "10:00"}
                disabled={closed}
                className="w-28 tabular-nums"
                aria-label={`${label}曜の開始時刻`}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                name={`close-${dow}`}
                defaultValue={hour?.close ?? "19:00"}
                disabled={closed}
                className="w-28 tabular-nums"
                aria-label={`${label}曜の終了時刻`}
              />
            </div>
          );
        })}
      </div>
      <FormError message={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <SavedNote saved={state.saved} />
      </div>
    </form>
  );
}
