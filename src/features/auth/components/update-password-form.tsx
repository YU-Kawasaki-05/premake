"use client";

// @implements v2-01

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AuthFormState, updatePassword } from "@/features/auth/actions";
import { FormError } from "./form-error";

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, {});

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="text-base font-semibold">新しいパスワードの設定</h1>
      <form action={action} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">新しいパスワード(8文字以上)</Label>
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
          {pending ? "更新中…" : "パスワードを更新"}
        </Button>
      </form>
    </div>
  );
}
