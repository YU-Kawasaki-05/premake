"use client";

// @implements v2-02

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
import { InviteStaffForm } from "./invite-staff-form";

export function InviteStaffDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  // 閉じるたびにフォームを再マウントし、前回の招待 URL を残さない(誤配布防止)
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
        <Button>スタッフを招待</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>スタッフを招待</DialogTitle>
          <DialogDescription>招待リンクを発行します(有効期限 7 日)。</DialogDescription>
        </DialogHeader>
        <InviteStaffForm key={instance} slug={slug} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
