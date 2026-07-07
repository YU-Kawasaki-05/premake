"use server";

// @implements v2-25 ops テナント管理

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createInvitation } from "@/features/invitations/create";
import { recordAudit } from "@/lib/audit";
import { requireOps } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateClinicState = {
  error?: string;
  inviteUrl?: string;
  clinicName?: string;
};

const RESERVED_SLUGS = new Set([
  "ops",
  "login",
  "logout",
  "invite",
  "auth",
  "c",
  "api",
  "reset-password",
]);

const createClinicSchema = z.object({
  name: z.string().min(1, "クリニック名を入力してください").max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,30}$/, "slug は英小文字・数字・ハイフン(2〜31文字)")
    .refine((s) => !RESERVED_SLUGS.has(s), "この slug は使用できません"),
  ownerEmail: z.email("メールアドレスの形式が正しくありません"),
});

export async function createClinic(
  _prev: CreateClinicState,
  formData: FormData,
): Promise<CreateClinicState> {
  const user = await requireOps();

  const parsed = createClinicSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    ownerEmail: formData.get("ownerEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const admin = createAdminClient();
  const { data: clinic, error } = await admin
    .from("clinics")
    .insert({ name: parsed.data.name, slug: parsed.data.slug })
    .select("id, name")
    .single();

  if (error || !clinic) {
    if (error?.code === "23505") return { error: "この slug は既に使われています" };
    console.error("[ops] createClinic failed", error);
    return { error: "クリニックの作成に失敗しました。時間をおいて再度お試しください" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "ops",
    action: "clinic.create",
    targetType: "clinic",
    targetId: clinic.id,
    diff: { name: parsed.data.name, slug: parsed.data.slug },
  });

  let inviteUrl: string;
  try {
    ({ inviteUrl } = await createInvitation({
      clinicId: clinic.id,
      email: parsed.data.ownerEmail,
      roles: ["owner"],
      createdBy: user.id,
      actorType: "ops",
    }));
  } catch (e) {
    // owner 招待のないクリニックが残ると再作成も詰まるため、作成した clinic をロールバック
    console.error("[ops] owner invite failed, rolling back clinic", e);
    await admin.from("clinics").delete().eq("id", clinic.id);
    return { error: "管理者への招待発行に失敗しました。もう一度お試しください" };
  }

  revalidatePath("/ops");
  return { inviteUrl, clinicName: clinic.name };
}
