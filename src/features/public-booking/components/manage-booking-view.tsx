"use client";

// @implements v2-21 患者側キャンセル

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelByToken } from "@/features/public-booking/actions";
import { cancelDeadlineMessage } from "@/features/public-booking/cancel-deadline";

export function ManageBookingView({
  token,
  slug,
  clinicName,
  clinicPhone,
  status,
  cancelDeadlineHours,
  pastCancelDeadline,
}: {
  token: string;
  slug: string;
  clinicName: string;
  clinicPhone: string | null;
  status: string;
  cancelDeadlineHours: number;
  pastCancelDeadline: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const alreadyClosed = status === "cancelled" || status === "done" || status === "checked_in";
  // 表示の出し分けのみ。期限の防御は cancelByToken 側に残している
  const canCancel = !alreadyClosed && !pastCancelDeadline;

  if (cancelled || status === "cancelled") {
    return (
      <p className="mt-6 text-center text-sm text-muted-foreground">
        この予約はキャンセルされました。
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {canCancel &&
        (confirming ? (
          <div className="space-y-2 rounded-md border border-[var(--status-no-show)] bg-[var(--status-no-show-bg)] p-3">
            <p className="text-[13px]">この予約をキャンセルしますか?</p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await cancelByToken(token);
                    if (res.error) toast.error(res.error);
                    else {
                      setCancelled(true);
                      toast.success("キャンセルしました");
                    }
                  })
                }
              >
                キャンセルする
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                戻る
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setConfirming(true)}>
            予約をキャンセル
          </Button>
        ))}
      {pastCancelDeadline && !alreadyClosed ? (
        <div className="rounded-md border border-[var(--line)] bg-[var(--paper)] p-3 text-[13px] leading-6">
          <p>{cancelDeadlineMessage(cancelDeadlineHours)}。</p>
          {clinicPhone && (
            <p className="mt-1 tabular-nums">
              TEL{" "}
              <a href={`tel:${clinicPhone}`} className="underline underline-offset-4">
                {clinicPhone}
              </a>
            </p>
          )}
        </div>
      ) : (
        <p className="text-[12px] leading-5 text-muted-foreground">
          キャンセルは予約の {cancelDeadlineHours}{" "}
          時間前まで可能です。それ以降はクリニックへ直接ご連絡ください。
        </p>
      )}
      <Link
        href={`/c/${slug}`}
        className="block text-center text-[13px] text-[var(--primary)] underline underline-offset-4"
      >
        {clinicName} のトップへ
      </Link>
    </div>
  );
}
