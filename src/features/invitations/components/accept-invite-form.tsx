"use client";

// @implements v2-02

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/features/auth/components/form-error";
import { type AcceptInviteState, acceptInviteAsNewUser } from "@/features/invitations/actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const boundAction = acceptInviteAsNewUser.bind(null, token);
  const [state, action, pending] = useActionState<AcceptInviteState, FormData>(boundAction, {});

  if (state.existingAccount) {
    return (
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          このメールアドレスのアカウントは既に存在します。ログインしてから、もう一度この招待リンクを開いてください。
        </p>
        <Button asChild className="w-full">
          <Link href="/login">ログインする</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="fullName">お名前</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required placeholder="山田 花子" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">パスワード(8文字以上)</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "登録中…" : "アカウントを作成して参加"}
      </Button>
    </form>
  );
}
