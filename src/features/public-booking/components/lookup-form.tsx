"use client";

// @implements v2-21 予約照会フォーム

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/features/auth/components/form-error";
import { type LookupState, lookupBooking } from "@/features/public-booking/actions";

export function LookupForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<LookupState, FormData>(lookupBooking, {});

  useEffect(() => {
    if (state.found) {
      router.push(`/c/${slug}/manage/${state.found.manageToken}`);
    }
  }, [state.found, router, slug]);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="space-y-1.5">
        <Label htmlFor="lk-no">予約番号</Label>
        <Input id="lk-no" name="bookingNo" required placeholder="B-250712-XXXX" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lk-email">メールアドレス</Label>
        <Input id="lk-email" name="email" type="email" required autoComplete="email" />
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "照会中…" : "予約を確認する"}
      </Button>
    </form>
  );
}
