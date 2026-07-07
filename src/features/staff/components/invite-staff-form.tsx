"use client";

// @implements v2-02

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/features/auth/components/form-error";
import { InviteUrlPanel } from "@/features/ops/components/invite-url-panel";
import { type InviteStaffState, inviteStaff } from "@/features/staff/actions";
import { ROLE_LABELS } from "@/features/staff/labels";

export function InviteStaffForm({ slug, onClose }: { slug: string; onClose: () => void }) {
  const boundAction = inviteStaff.bind(null, slug);
  const [state, action, pending] = useActionState<InviteStaffState, FormData>(boundAction, {});

  if (state.inviteUrl) {
    return (
      <InviteUrlPanel
        inviteUrl={state.inviteUrl}
        description="以下の招待リンクを本人に渡してください。"
        onClose={onClose}
      />
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">メールアドレス</Label>
        <Input id="invite-email" name="email" type="email" required />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">ロール</legend>
        <div className="flex gap-4">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <span key={role} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                id={`invite-role-${role}`}
                name={`role-${role}`}
                defaultChecked={role === "staff"}
              />
              <label htmlFor={`invite-role-${role}`}>{label}</label>
            </span>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="invite-employment">雇用区分(任意)</Label>
        <Select name="employmentType">
          <SelectTrigger id="invite-employment" className="w-full">
            <SelectValue placeholder="未設定" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="employed">雇用</SelectItem>
            <SelectItem value="contracted">業務委託</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "発行中…" : "招待リンクを発行"}
      </Button>
    </form>
  );
}
