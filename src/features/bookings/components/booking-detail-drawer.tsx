"use client";

// @implements v2-11 予約変更・キャンセル / v2-12 ステータス遷移

import { formatInTimeZone } from "date-fns-tz";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  type BookingActionState,
  cancelBooking,
  updateBookingStatus,
} from "@/features/bookings/actions";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_STYLE,
  type BookingStatus,
  jstHhmm,
  nextStatuses,
} from "@/features/bookings/booking-status";
import { parseRange } from "@/features/schedule/week";
import { TIME_ZONE } from "@/lib/datetime";
import { BookingRescheduleDialog } from "./booking-reschedule-dialog";
import type { LedgerSession } from "./day-ledger";

type Option = { id: string; name: string };
type MemberOption = Option & { bookable: boolean };

// リスケ可能なステータス(来院以降・完了・キャンセルは変更不可)
const RESCHEDULABLE: BookingStatus[] = ["requested", "confirmed"];

export function BookingDetailDrawer({
  slug,
  session,
  memberName,
  rooms,
  members,
  onClose,
}: {
  slug: string;
  session: LedgerSession | null;
  memberName: string;
  rooms: Option[];
  members: MemberOption[];
  onClose: () => void;
}) {
  const booking = session?.booking ?? null;
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const [cancelState, cancelAction, cancelPending] = useActionState<BookingActionState, FormData>(
    cancelBooking.bind(null, slug),
    {},
  );

  useEffect(() => {
    if (cancelState.ok) {
      toast.success("予約をキャンセルしました");
      onClose();
    } else if (cancelState.error) {
      toast.error(cancelState.error);
    }
  }, [cancelState.ok, cancelState.error, onClose]);

  if (!session || !booking) return null;
  const bookingId = booking.id;
  const status = booking.status as BookingStatus;
  const range = parseRange(session.time_range);
  const transitions = nextStatuses(status);
  const canReschedule = RESCHEDULABLE.includes(status);
  const rsDefaultDate = range ? formatInTimeZone(range.start, TIME_ZONE, "yyyy-MM-dd") : "";
  const rsDefaultTime = range ? jstHhmm(range.start) : "";

  function changeStatus(next: BookingStatus) {
    startTransition(async () => {
      const res = await updateBookingStatus(slug, bookingId, next);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`「${BOOKING_STATUS_LABELS[next]}」に更新しました`);
        onClose();
      }
    });
  }

  return (
    <Sheet open={!!session} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {booking.patient?.name ?? "(患者未設定)"}
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                color: BOOKING_STATUS_STYLE[status].color,
                backgroundColor: BOOKING_STATUS_STYLE[status].bg,
              }}
            >
              {BOOKING_STATUS_LABELS[status]}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6 text-sm">
          <dl className="space-y-1.5">
            <Row label="予約番号" value={booking.booking_no} />
            <Row label="メニュー" value={booking.service?.name ?? "—"} />
            <Row
              label="日時"
              value={range ? `${jstHhmm(range.start)}–${jstHhmm(range.end)}` : "—"}
            />
            <Row label="担当" value={memberName} />
            {session.label && <Row label="セッション" value={session.label} />}
            {booking.notes && <Row label="メモ" value={booking.notes} />}
          </dl>

          {transitions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12.5px] font-medium text-muted-foreground">ステータス変更</p>
              <div className="flex flex-wrap gap-2">
                {transitions
                  .filter((t) => t !== "cancelled")
                  .map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => changeStatus(t)}
                    >
                      {BOOKING_STATUS_LABELS[t]}にする
                    </Button>
                  ))}
              </div>
            </div>
          )}

          {canReschedule && (
            <div className="border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={() => setRescheduling(true)}>
                予約を変更
              </Button>
            </div>
          )}

          {status !== "cancelled" && status !== "done" && (
            <div className="border-t border-border pt-4">
              {confirmingCancel ? (
                <form action={cancelAction} className="space-y-2">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Input name="reason" placeholder="キャンセル理由(任意)" />
                  <div className="flex gap-2">
                    <Button type="submit" variant="destructive" size="sm" disabled={cancelPending}>
                      キャンセルを確定
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingCancel(false)}
                    >
                      戻る
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--destructive)]"
                  onClick={() => setConfirmingCancel(true)}
                >
                  予約をキャンセル
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>

      {canReschedule && (
        <BookingRescheduleDialog
          key={bookingId}
          slug={slug}
          bookingId={bookingId}
          open={rescheduling}
          onOpenChange={setRescheduling}
          rooms={rooms}
          members={members}
          defaultDate={rsDefaultDate}
          defaultTime={rsDefaultTime}
          defaultMemberId={session.member_id}
          defaultRoomId={session.room_id}
          onRescheduled={() => {
            setRescheduling(false);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}
