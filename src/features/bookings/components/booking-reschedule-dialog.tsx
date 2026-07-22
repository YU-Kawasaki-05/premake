"use client";

// @implements v2-11 予約変更(リスケ): 開始日時 + 担当・部屋の一括変更

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { type BookingActionState, rescheduleBooking } from "@/features/bookings/actions";

type Option = { id: string; name: string };
type MemberOption = Option & { bookable: boolean };

export function BookingRescheduleDialog({
  slug,
  bookingId,
  open,
  onOpenChange,
  rooms,
  members,
  defaultDate,
  defaultTime,
  defaultMemberId,
  defaultRoomId,
  onRescheduled,
}: {
  slug: string;
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Option[];
  members: MemberOption[];
  defaultDate: string;
  defaultTime: string;
  defaultMemberId: string;
  defaultRoomId: string;
  onRescheduled: () => void;
}) {
  const [state, formAction, pending] = useActionState<BookingActionState, FormData>(
    rescheduleBooking.bind(null, slug),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("予約を変更しました");
      onRescheduled();
    }
  }, [state.ok, onRescheduled]);

  // 担当候補は予約可能スタッフを優先。現担当が候補に無ければ先頭に補う(defaultValue を有効にするため)。
  const bookable = members.filter((m) => m.bookable);
  let memberChoices = bookable.length > 0 ? bookable : members;
  if (defaultMemberId && !memberChoices.some((m) => m.id === defaultMemberId)) {
    const cur = members.find((m) => m.id === defaultMemberId);
    if (cur) memberChoices = [cur, ...memberChoices];
  }
  let roomChoices = rooms;
  if (defaultRoomId && !roomChoices.some((r) => r.id === defaultRoomId)) {
    // 現在の部屋が非アクティブ等で候補に無い場合の保険(名前は不明なので id を出さない代替名)
    roomChoices = [{ id: defaultRoomId, name: "(現在の部屋)" }, ...rooms];
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>予約を変更</DialogTitle>
          <DialogDescription>
            開始日時・担当・部屋を変更します。セッションは新しい開始時刻から自動で再配置されます。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rs-date">日付</Label>
              <Input
                id="rs-date"
                name="startDate"
                type="date"
                required
                defaultValue={defaultDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-time">開始時刻</Label>
              <Input
                id="rs-time"
                name="startTime"
                type="time"
                required
                defaultValue={defaultTime}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-member">担当</Label>
              <Select name="memberId" defaultValue={defaultMemberId}>
                <SelectTrigger id="rs-member" className="w-full">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  {memberChoices.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-room">部屋</Label>
              <Select name="roomId" defaultValue={defaultRoomId}>
                <SelectTrigger id="rs-room" className="w-full">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  {roomChoices.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <FormError message={state.error} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "変更中…" : "変更を保存"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
