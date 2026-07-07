"use client";

// @implements v2-25

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateClinicForm } from "./create-clinic-form";

export function CreateClinicDialog() {
  const [open, setOpen] = useState(false);
  // 閉じるたびに instance を進め、フォーム(useActionState)を再マウントして前回の招待 URL を残さない
  const [instance, setInstance] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInstance((i) => i + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>クリニックを追加</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>クリニックを追加</DialogTitle>
          <DialogDescription>
            作成と同時に管理者(owner)への招待リンクを発行します。
          </DialogDescription>
        </DialogHeader>
        <CreateClinicForm key={instance} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
