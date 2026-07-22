"use client";

// @implements v2-21 患者側キャンセル

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelByToken } from "@/features/public-booking/actions";

export function ManageBookingView({
  token,
  slug,
  clinicName,
  status,
  cancelDeadlineHours,
}: {
  token: string;
  slug: string;
  clinicName: string;
  status: string;
  cancelDeadlineHours: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const alreadyClosed = status === "cancelled" || status === "done" || status === "checked_in";

  if (cancelled || status === "cancelled") {
    return (
      <p className="mt-6 text-center text-sm text-muted-foreground">
        この予約はキャンセルされました。
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {!alreadyClosed &&
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
      <p className="text-[12px] leading-5 text-muted-foreground">
        キャンセルは予約の {cancelDeadlineHours}{" "}
        時間前まで可能です。それ以降はクリニックへ直接ご連絡ください。
      </p>
      <Link
        href={`/c/${slug}`}
        className="block text-center text-[13px] text-[var(--primary)] underline underline-offset-4"
      >
        {clinicName} のトップへ
      </Link>
    </div>
  );
}
