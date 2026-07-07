"use client";

// @implements v2-02 メンバー行 + 編集ダイアログ

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormError } from "@/features/auth/components/form-error";
import { type UpdateMemberState, updateMember } from "@/features/staff/actions";
import { EMPLOYMENT_LABELS, ROLE_LABELS } from "@/features/staff/labels";

type Member = {
  id: string;
  roles: string[];
  employment_type: string | null;
  display_name: string | null;
  is_bookable: boolean;
  status: string;
  profiles: { full_name: string } | null;
};

export function MemberRow({ slug, member }: { slug: string; member: Member }) {
  const [open, setOpen] = useState(false);
  const boundAction = updateMember.bind(null, slug);
  const [state, action, pending] = useActionState<UpdateMemberState, FormData>(boundAction, {});

  const inactive = member.status === "inactive";

  return (
    <>
      <tr
        className={`border-b border-[var(--line-soft)] last:border-0 ${inactive ? "opacity-50" : ""}`}
      >
        <td className="px-4 py-3">
          <span className="font-medium">{member.profiles?.full_name || "(未設定)"}</span>
          {member.display_name && (
            <span className="ml-2 text-[12.5px] text-muted-foreground">
              表示名: {member.display_name}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {member.roles.map((role) => (
              <Badge key={role} variant="secondary" className="font-normal">
                {ROLE_LABELS[role] ?? role}
              </Badge>
            ))}
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {member.employment_type ? EMPLOYMENT_LABELS[member.employment_type] : "—"}
        </td>
        <td className="px-4 py-3">{member.is_bookable ? "可" : "—"}</td>
        <td className="px-4 py-3">
          {inactive ? (
            <span className="text-muted-foreground">無効</span>
          ) : (
            <span className="text-[var(--status-confirmed)]">有効</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            編集
          </Button>
        </td>
      </tr>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{member.profiles?.full_name || "メンバー"} の編集</DialogTitle>
          </DialogHeader>
          <form action={action} className="space-y-4">
            <input type="hidden" name="memberId" value={member.id} />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">ロール</legend>
              <div className="flex gap-4">
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <span key={role} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      id={`role-${role}-${member.id}`}
                      name={`role-${role}`}
                      defaultChecked={member.roles.includes(role)}
                    />
                    <label htmlFor={`role-${role}-${member.id}`}>{label}</label>
                  </span>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`employment-${member.id}`}>雇用区分</Label>
                <Select name="employmentType" defaultValue={member.employment_type ?? undefined}>
                  <SelectTrigger id={`employment-${member.id}`} className="w-full">
                    <SelectValue placeholder="未設定" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employed">雇用</SelectItem>
                    <SelectItem value="contracted">業務委託</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`display-${member.id}`}>表示名(指名用)</Label>
                <Input
                  id={`display-${member.id}`}
                  name="displayName"
                  defaultValue={member.display_name ?? ""}
                  placeholder="例: 鈴木"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor={`bookable-${member.id}`}>公開ページで指名可能にする</Label>
              <Switch
                id={`bookable-${member.id}`}
                name="isBookable"
                defaultChecked={member.is_bookable}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor={`status-${member.id}`}>アカウント無効化</Label>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  無効化するとこのクリニックにアクセスできなくなります
                </p>
              </div>
              <Switch
                id={`status-${member.id}`}
                name="status"
                value="inactive"
                defaultChecked={inactive}
              />
            </div>
            <FormError message={state.error} />
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
