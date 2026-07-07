"use client";

// @implements v2-01

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AuthFormState, login } from "@/features/auth/actions";
import { FormError } from "./form-error";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, {});

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="text-base font-semibold">スタッフログイン</h1>
      <form action={action} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">メールアドレス</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            defaultValue={state.email}
            key={state.email}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">パスワード</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FormError message={state.error} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "ログイン中…" : "ログイン"}
        </Button>
      </form>
      <p className="mt-4 text-center">
        <Link
          href="/reset-password"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          パスワードをお忘れですか?
        </Link>
      </p>
    </div>
  );
}
