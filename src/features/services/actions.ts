"use server";

// @implements v2-05 メニュー管理 / v2-07 担当設定(カテゴリ含む)

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ServiceFormState = { error?: string; saved?: boolean };

const sessionStepSchema = z.object({
  kind: z.enum(["counseling", "procedure", "retouch", "other"]),
  label: z.string().max(40).nullable(),
  duration_min: z.number().int().min(5).max(600),
  buffer_min: z.number().int().min(0).max(240),
});

const serviceSchema = z.object({
  name: z.string().min(1, "メニュー名を入力してください").max(100),
  categoryId: z.union([z.uuid(), z.literal("")]).optional(),
  description: z.string().max(2000).optional(),
  priceYen: z.union([z.coerce.number().int().min(0).max(100_000_000), z.literal("")]).optional(),
  showPrice: z.boolean(),
  isPublic: z.boolean(),
  allowNomination: z.boolean(),
  questionnaireTemplateId: z.union([z.uuid(), z.literal("")]).optional(),
  sessionTemplate: z.array(sessionStepSchema).min(1, "セッションを1つ以上構成してください"),
});

function parseServiceForm(formData: FormData) {
  let sessionTemplate: unknown;
  try {
    sessionTemplate = JSON.parse(String(formData.get("sessionTemplate") ?? "[]"));
  } catch {
    sessionTemplate = null;
  }
  return serviceSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId") || undefined,
    description: formData.get("description") || undefined,
    priceYen: formData.get("priceYen") ?? "",
    showPrice: formData.get("showPrice") === "on",
    isPublic: formData.get("isPublic") === "on",
    allowNomination: formData.get("allowNomination") === "on",
    questionnaireTemplateId: formData.get("questionnaireTemplateId") || undefined,
    sessionTemplate,
  });
}

export async function createService(
  slug: string,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { user, clinic } = await requireMember(slug, "owner");
  const parsed = parseServiceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      clinic_id: clinic.id,
      name: d.name,
      category_id: d.categoryId || null,
      description: d.description || null,
      price_yen: d.priceYen === "" || d.priceYen === undefined ? null : d.priceYen,
      show_price: d.showPrice,
      is_public: d.isPublic,
      allow_nomination: d.allowNomination,
      questionnaire_template_id: d.questionnaireTemplateId || null,
      session_template: d.sessionTemplate,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[services] create failed", error);
    return { error: "メニューの作成に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "service.create",
    targetType: "service",
    targetId: data.id,
    diff: { name: d.name },
  });
  revalidatePath(`/${slug}/services`);
  return { saved: true };
}

export async function updateService(
  slug: string,
  serviceId: string,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { user, clinic } = await requireMember(slug, "owner");
  const parsed = parseServiceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({
      name: d.name,
      category_id: d.categoryId || null,
      description: d.description || null,
      price_yen: d.priceYen === "" || d.priceYen === undefined ? null : d.priceYen,
      show_price: d.showPrice,
      is_public: d.isPublic,
      allow_nomination: d.allowNomination,
      questionnaire_template_id: d.questionnaireTemplateId || null,
      session_template: d.sessionTemplate,
    })
    .eq("id", serviceId)
    .eq("clinic_id", clinic.id);
  if (error) {
    console.error("[services] update failed", error);
    return { error: "保存に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "service.update",
    targetType: "service",
    targetId: serviceId,
  });
  revalidatePath(`/${slug}/services`);
  return { saved: true };
}

export async function setServiceStatus(slug: string, serviceId: string, archived: boolean) {
  const { user, clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", serviceId)
    .eq("clinic_id", clinic.id);
  if (error) return { error: "変更に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: archived ? "service.archive" : "service.restore",
    targetType: "service",
    targetId: serviceId,
  });
  revalidatePath(`/${slug}/services`);
  return {};
}

const categorySchema = z.object({ name: z.string().min(1).max(50) });

export async function createCategory(
  slug: string,
  _prev: { error?: string; saved?: boolean },
  formData: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  const { user, clinic } = await requireMember(slug, "owner");
  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: "カテゴリ名を入力してください" };

  const supabase = await createClient();
  const { count } = await supabase
    .from("service_categories")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic.id);
  const { error } = await supabase.from("service_categories").insert({
    clinic_id: clinic.id,
    name: parsed.data.name,
    sort_order: count ?? 0,
  });
  if (error) return { error: "カテゴリの作成に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "service_category.create",
  });
  revalidatePath(`/${slug}/services`);
  return { saved: true };
}
