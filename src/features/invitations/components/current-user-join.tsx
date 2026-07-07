"use client";

// @implements v2-02

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { FormError } from "@/features/auth/components/form-error";
import { acceptInviteAsCurrentUser } from "@/features/invitations/actions";

export function CurrentUserJoin({
  token,
  invitedEmail,
  currentEmail,
}: {
  token: string;
  invitedEmail: string;
  currentEmail: string;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const emailMatches = invitedEmail.toLowerCase() === currentEmail.toLowerCase();

  if (!emailMatches) {
    return (
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          現在 {currentEmail} でログイン中です。この招待を受けるには、いったんログアウトして
          {invitedEmail} で操作してください。
        </p>
        <form action={logout}>
          <Button type="submit" variant="outline" className="w-full">
            ログアウトする
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <FormError message={error} />
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInviteAsCurrentUser(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "参加処理中…" : "このアカウントで参加する"}
      </Button>
    </div>
  );
}
