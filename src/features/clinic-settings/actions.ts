"use server";

// @implements v2-03 テナント設定

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SettingsFormState = { error?: string; saved?: boolean };

const profileSchema = z.object({
  name: z.string().min(1, "クリニック名を入力してください").max(100),
  director_name: z.string().max(60).optional(),
  postal_code: z.string().max(10).optional(),
  address: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  email: z.union([z.email("メールアドレスの形式が正しくありません"), z.literal("")]).optional(),
});

export async function updateClinicProfile(
  slug: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { user, clinic } = await requireMember(slug, "owner");

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    director_name: formData.get("director_name") ?? undefined,
    postal_code: formData.get("postal_code") ?? undefined,
    address: formData.get("address") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update(parsed.data).eq("id", clinic.id);
  if (error) return { error: "保存に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "clinic.update_profile",
    targetType: "clinic",
    targetId: clinic.id,
  });
  revalidatePath(`/${slug}/settings`);
  return { saved: true };
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateBusinessHours(
  slug: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { user, clinic } = await requireMember(slug, "owner");

  const hours: { dow: number; open: string; close: string }[] = [];
  for (let dow = 0; dow <= 6; dow++) {
    if (formData.get(`closed-${dow}`) === "on") continue;
    const open = String(formData.get(`open-${dow}`) ?? "");
    const close = String(formData.get(`close-${dow}`) ?? "");
    if (!timePattern.test(open) || !timePattern.test(close)) {
      return { error: "時刻の形式が正しくありません" };
    }
    if (open >= close) {
      return { error: "営業終了は開始より後の時刻にしてください" };
    }
    hours.push({ dow, open, close });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({ business_hours: hours })
    .eq("id", clinic.id);
  if (error) return { error: "保存に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "clinic.update_business_hours",
    targetType: "clinic",
    targetId: clinic.id,
    diff: { business_hours: hours },
  });
  revalidatePath(`/${slug}/settings`);
  return { saved: true };
}

const publicSettingsSchema = z.object({
  public_booking_enabled: z.boolean(),
  // auto(メール確認後に自動確定)は確認リンクのステップが未実装のため受け付けない。
  // DB の check 制約は 'auto' を許すので、改ざん送信をここで弾く必要がある。
  booking_approval_mode: z.literal("manual"),
  cancel_deadline_hours: z.coerce.number().int().min(0).max(720),
});

export async function updatePublicSettings(
  slug: string,
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { user, clinic } = await requireMember(slug, "owner");

  const parsed = publicSettingsSchema.safeParse({
    public_booking_enabled: formData.get("public_booking_enabled") === "on",
    booking_approval_mode: formData.get("booking_approval_mode"),
    cancel_deadline_hours: formData.get("cancel_deadline_hours"),
  });
  if (!parsed.success) {
    return { error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update(parsed.data).eq("id", clinic.id);
  if (error) return { error: "保存に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "clinic.update_public_settings",
    targetType: "clinic",
    targetId: clinic.id,
    diff: parsed.data,
  });
  revalidatePath(`/${slug}/settings`);
  return { saved: true };
}
