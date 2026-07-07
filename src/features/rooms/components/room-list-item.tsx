"use client";

// @implements v2-06 部屋一覧の行(編集・アーカイブ)

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setRoomStatus } from "@/features/rooms/actions";
import { RoomFormDialog, type RoomRow } from "@/features/rooms/components/room-form-dialog";

export function RoomListItem({ slug, room }: { slug: string; room: RoomRow & { status: string } }) {
  const [pending, startTransition] = useTransition();
  const archived = room.status === "archived";

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 ${
        archived ? "opacity-55" : ""
      }`}
    >
      <span className="font-medium">{room.name}</span>
      <div className="flex shrink-0 items-center gap-1">
        <RoomFormDialog
          slug={slug}
          room={room}
          trigger={
            <Button variant="ghost" size="sm">
              編集
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await setRoomStatus(slug, room.id, !archived);
              if (r?.error) toast.error(r.error);
              else toast.success(archived ? "有効化しました" : "アーカイブしました");
            })
          }
        >
          {archived ? "戻す" : "アーカイブ"}
        </Button>
      </div>
    </li>
  );
}
