"use client";

// @implements v2-03 オンライン予約の公開設定

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
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
import { type SettingsFormState, updatePublicSettings } from "@/features/clinic-settings/actions";
import { SavedNote } from "./saved-note";

type Defaults = {
  public_booking_enabled: boolean;
  booking_approval_mode: "auto" | "manual";
  cancel_deadline_hours: number;
};

export function PublicSettingsForm({ slug, defaults }: { slug: string; defaults: Defaults }) {
  const boundAction = updatePublicSettings.bind(null, slug);
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(boundAction, {});

  return (
    <form action={action} className="mt-4 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="public_booking_enabled">患者向けオンライン予約</Label>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            公開ページ(/c/{slug})から患者が予約できるようになります
          </p>
        </div>
        <Switch
          id="public_booking_enabled"
          name="public_booking_enabled"
          defaultChecked={defaults.public_booking_enabled}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="booking_approval_mode">Web 予約の確定方法</Label>
          <Select name="booking_approval_mode" defaultValue={defaults.booking_approval_mode}>
            <SelectTrigger id="booking_approval_mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">院内で確認してから確定(推奨)</SelectItem>
              <SelectItem value="auto">メール確認後に自動確定</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cancel_deadline_hours">患者キャンセル期限(時間前まで)</Label>
          <Input
            id="cancel_deadline_hours"
            name="cancel_deadline_hours"
            type="number"
            min={0}
            max={720}
            defaultValue={defaults.cancel_deadline_hours}
            className="tabular-nums"
          />
        </div>
      </div>

      <FormError message={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <SavedNote saved={state.saved} />
      </div>
    </form>
  );
}
