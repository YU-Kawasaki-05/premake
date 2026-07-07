"use client";

// @implements v2-06 部屋の作成/編集ダイアログ

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/features/auth/components/form-error";
import { createRoom, type RoomFormState, updateRoom } from "@/features/rooms/actions";

export type RoomRow = { id: string; name: string };

export function RoomFormDialog({
  slug,
  room,
  trigger,
}: {
  slug: string;
  room?: RoomRow;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInstance((i) => i + 1);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{room ? "部屋を編集" : "部屋を追加"}</DialogTitle>
          <DialogDescription>施術に使う部屋を管理します。</DialogDescription>
        </DialogHeader>
        <RoomForm key={instance} slug={slug} room={room} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RoomForm({ slug, room, onSaved }: { slug: string; room?: RoomRow; onSaved: () => void }) {
  const action = room ? updateRoom.bind(null, slug, room.id) : createRoom.bind(null, slug);
  const [state, formAction, pending] = useActionState<RoomFormState, FormData>(action, {});

  // 保存成功でダイアログを閉じる(親の instance key で次回はまっさら)
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="room-name">部屋名</Label>
        <Input id="room-name" name="name" required maxLength={50} defaultValue={room?.name} />
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "保存中…" : room ? "保存" : "追加"}
      </Button>
    </form>
  );
}
