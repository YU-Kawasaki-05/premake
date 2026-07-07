"use client";

// @implements v2-05 カテゴリのインライン作成

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createCategory } from "@/features/services/actions";

export function CategoryCreateInline({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const action = createCategory.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state.saved) {
      toast.success("カテゴリを追加しました");
      setOpen(false);
    }
  }, [state.saved]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInstance((i) => i + 1);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline">カテゴリ追加</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" key={instance}>
        <form action={formAction} className="space-y-2">
          <Label htmlFor="cat-name" className="text-sm">
            カテゴリ名
          </Label>
          <Input id="cat-name" name="name" required placeholder="例: アートメイク" />
          {state.error && <p className="text-[12.5px] text-[var(--destructive)]">{state.error}</p>}
          <Button type="submit" size="sm" className="w-full" disabled={pending}>
            {pending ? "追加中…" : "追加"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
