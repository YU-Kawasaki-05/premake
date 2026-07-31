import type { Metadata } from "next";
import Link from "next/link";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/features/bookings/booking-status";
import { getManagedBooking } from "@/features/public-booking/actions";
import { ManageBookingView } from "@/features/public-booking/components/manage-booking-view";
import { formatTimeRange } from "@/lib/datetime";

export const metadata: Metadata = { title: { absolute: "予約内容" } };

// @implements v2-21 予約内容の確認・キャンセル(管理トークン)
export default async function ManagePage(props: PageProps<"/c/[slug]/manage/[token]">) {
  const { slug, token } = await props.params;
  const booking = await getManagedBooking(token);

  if (!booking) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="font-serif text-lg font-semibold">リンクが無効です</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクの有効期限が切れているか、無効です。
        </p>
        <Link
          href={`/c/${slug}/lookup`}
          className="mt-4 inline-block text-sm text-[var(--primary)] underline underline-offset-4"
        >
          予約番号で再照会する
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="font-serif text-xl font-semibold">{booking.clinicName}</h1>
      <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 text-sm">
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">予約番号</dt>
            <dd className="tabular-nums">{booking.bookingNo}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">メニュー</dt>
            <dd>{booking.serviceName ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">日時</dt>
            <dd className="tabular-nums">
              {booking.startISO && booking.endISO
                ? formatTimeRange(booking.startISO, booking.endISO)
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">状態</dt>
            <dd>{BOOKING_STATUS_LABELS[booking.status as BookingStatus] ?? booking.status}</dd>
          </div>
        </dl>
      </div>

      <ManageBookingView
        token={token}
        slug={slug}
        clinicName={booking.clinicName}
        clinicPhone={booking.clinicPhone}
        status={booking.status}
        cancelDeadlineHours={booking.cancelDeadlineHours}
        pastCancelDeadline={booking.pastCancelDeadline}
      />
    </main>
  );
}
