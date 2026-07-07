"use client";

// @implements v2-25

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/features/auth/components/form-error";
import { type CreateClinicState, createClinic } from "@/features/ops/actions";
import { InviteUrlPanel } from "./invite-url-panel";

export function CreateClinicForm({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<CreateClinicState, FormData>(createClinic, {});

  if (state.inviteUrl) {
    return (
      <InviteUrlPanel
        inviteUrl={state.inviteUrl}
        description={`「${state.clinicName}」を作成しました。以下の招待リンクを管理者に渡してください(有効期限 7 日)。`}
        onClose={onClose}
      />
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="clinic-name">クリニック名</Label>
        <Input id="clinic-name" name="name" required placeholder="〇〇クリニック" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clinic-slug">slug(URL 用・英小文字)</Label>
        <Input
          id="clinic-slug"
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9-]{1,30}"
          placeholder="example-clinic"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="owner-email">管理者のメールアドレス</Label>
        <Input id="owner-email" name="ownerEmail" type="email" required />
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "作成中…" : "作成して招待リンクを発行"}
      </Button>
    </form>
  );
}
