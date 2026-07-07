"use client";

// @implements v2-03

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/features/auth/components/form-error";
import { type SettingsFormState, updateClinicProfile } from "@/features/clinic-settings/actions";
import { SavedNote } from "./saved-note";

type Defaults = {
  name: string;
  director_name: string;
  postal_code: string;
  address: string;
  phone: string;
  email: string;
};

export function ClinicProfileForm({ slug, defaults }: { slug: string; defaults: Defaults }) {
  const boundAction = updateClinicProfile.bind(null, slug);
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(boundAction, {});

  return (
    <form action={action} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">クリニック名</Label>
          <Input id="name" name="name" required defaultValue={defaults.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="director_name">院長名</Label>
          <Input id="director_name" name="director_name" defaultValue={defaults.director_name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postal_code">郵便番号</Label>
          <Input
            id="postal_code"
            name="postal_code"
            inputMode="numeric"
            placeholder="150-0001"
            defaultValue={defaults.postal_code}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">住所</Label>
          <Input id="address" name="address" defaultValue={defaults.address} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">電話番号</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">メールアドレス</Label>
          <Input id="email" name="email" type="email" defaultValue={defaults.email} />
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
