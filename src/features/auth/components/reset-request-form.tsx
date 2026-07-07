"use client";

// @implements v2-01

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AuthFormState, requestPasswordReset } from "@/features/auth/actions";
import { FormError } from "./form-error";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<AuthFormState & { done?: boolean }, FormData>(
    requestPasswordReset,
    {},
  );

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="text-base font-semibold">パスワード再設定</h1>
      {state.done ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          入力されたメールアドレス宛に再設定用のリンクを送信しました。メールをご確認ください。
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            登録済みのメールアドレスに再設定用リンクをお送りします。
          </p>
          <form action={action} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">メールアドレス</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <FormError message={state.error} />
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "送信中…" : "再設定リンクを送る"}
            </Button>
          </form>
        </>
      )}
      <p className="mt-4 text-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ログインに戻る
        </Link>
      </p>
    </div>
  );
}
