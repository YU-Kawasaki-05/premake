"use client";

// @implements v2-08 施術枠の作成ダイアログ(単発 + 曜日繰り返し)

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/features/auth/components/form-error";
import { createScheduleBlocks, type ScheduleFormState } from "@/features/schedule/actions";

type Option = { id: string; name: string };
const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function ScheduleBlockDialog({
  slug,
  members,
  rooms,
  currentMemberId,
  defaultDate,
}: {
  slug: string;
  members: Option[];
  rooms: Option[];
  currentMemberId: string;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const [repeat, setRepeat] = useState(false);

  const [state, formAction, pending] = useActionState<ScheduleFormState, FormData>(
    createScheduleBlocks.bind(null, slug),
    {},
  );

  useEffect(() => {
    if (state.created !== undefined) {
      if (state.error) toast.info(state.error);
      else toast.success(`${state.created}件の施術枠を登録しました`);
      setOpen(false);
    }
  }, [state.created, state.error]);

  const disabled = rooms.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setInstance((i) => i + 1);
          setRepeat(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>施術枠を追加</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" key={instance}>
        <DialogHeader>
          <DialogTitle>施術枠を追加</DialogTitle>
          <DialogDescription>
            部屋×時間帯を確保します。患者予約はこの「受付枠(open)」に入ります。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sb-member">担当スタッフ</Label>
              {/* No.35: メンバー全員が任意スタッフの枠を作成できる。既定は自分だが変更可。 */}
              <Select name="memberId" defaultValue={currentMemberId}>
                <SelectTrigger id="sb-member" className="w-full">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-room">部屋</Label>
              <Select name="roomId">
                <SelectTrigger id="sb-room" className="w-full">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sb-type">種別</Label>
            <Select name="blockType" defaultValue="open">
              <SelectTrigger id="sb-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">受付枠(患者予約を受け付ける)</SelectItem>
                <SelectItem value="blocked">占有(休憩・準備など)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sb-date">日付</Label>
              <Input
                id="sb-date"
                name="startDate"
                type="date"
                required
                defaultValue={defaultDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-start">開始</Label>
              <Input id="sb-start" name="startTime" type="time" required defaultValue="10:00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-end">終了</Label>
              <Input id="sb-end" name="endTime" type="time" required defaultValue="18:00" />
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <label htmlFor="sb-repeat" className="flex items-center gap-2 text-sm">
              <Checkbox
                id="sb-repeat"
                checked={repeat}
                onCheckedChange={(v) => setRepeat(v === true)}
              />
              曜日を指定して繰り返し登録
            </label>
            {repeat && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-1">
                  {DOW_LABELS.map((label, dow) => (
                    <label
                      key={label}
                      htmlFor={`dow-${dow}`}
                      className="flex flex-1 cursor-pointer flex-col items-center gap-1 text-[12.5px]"
                    >
                      <Checkbox id={`dow-${dow}`} name={`dow-${dow}`} />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sb-until">繰り返し終了日</Label>
                  <Input id="sb-until" name="repeatUntil" type="date" />
                </div>
                <p className="text-[11px] text-[var(--ink-faint)]">
                  開始日〜終了日の、選んだ曜日すべてに同じ時間帯で登録します。
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sb-note">メモ(任意)</Label>
            <Input id="sb-note" name="note" placeholder="例: 午後のみ" />
          </div>

          <FormError
            message={state.error && state.created === undefined ? state.error : undefined}
          />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "登録中…" : "登録"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
