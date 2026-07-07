"use server";

// @implements v2-17 問診テンプレート管理

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TemplateFormState = { error?: string; saved?: boolean };

const questionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["text", "textarea", "radio", "checkbox", "date", "consent"]),
    label: z.string().min(1, "質問文を入力してください").max(200),
    options: z
      .array(z.string().max(100))
      .transform((arr) => arr.map((s) => s.trim()).filter(Boolean))
      .optional(),
    required: z.boolean(),
  })
  .refine(
    (q) => (q.type !== "radio" && q.type !== "checkbox" ? true : (q.options?.length ?? 0) >= 1),
    {
      message: "選択肢を1つ以上入力してください",
      path: ["options"],
    },
  );

const templateSchema = z.object({
  name: z.string().min(1, "テンプレート名を入力してください").max(100),
  questions: z.array(questionSchema).min(1, "質問を1つ以上追加してください"),
});

function parseTemplateForm(formData: FormData) {
  let questions: unknown;
  try {
    questions = JSON.parse(String(formData.get("questions") ?? "[]"));
  } catch {
    questions = null;
  }
  return templateSchema.safeParse({
    name: formData.get("name"),
    questions,
  });
}

export async function createTemplate(
  slug: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const { user, clinic } = await requireMember(slug, "owner");
  const parsed = parseTemplateForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questionnaire_templates")
    .insert({
      clinic_id: clinic.id,
      name: d.name,
      questions: d.questions,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[questionnaires] create failed", error);
    return { error: "テンプレートの作成に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "questionnaire_template.create",
    targetType: "questionnaire_template",
    targetId: data.id,
    diff: { name: d.name },
  });
  revalidatePath(`/${slug}/questionnaires`);
  return { saved: true };
}

export async function updateTemplate(
  slug: string,
  templateId: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const { user, clinic } = await requireMember(slug, "owner");
  const parsed = parseTemplateForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("questionnaire_templates")
    .update({
      name: d.name,
      questions: d.questions,
    })
    .eq("id", templateId)
    .eq("clinic_id", clinic.id);
  if (error) {
    console.error("[questionnaires] update failed", error);
    return { error: "保存に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "questionnaire_template.update",
    targetType: "questionnaire_template",
    targetId: templateId,
  });
  revalidatePath(`/${slug}/questionnaires`);
  return { saved: true };
}

export async function setTemplateStatus(slug: string, templateId: string, archived: boolean) {
  const { user, clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();
  const { error } = await supabase
    .from("questionnaire_templates")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", templateId)
    .eq("clinic_id", clinic.id);
  if (error) return { error: "変更に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: archived ? "questionnaire_template.archive" : "questionnaire_template.restore",
    targetType: "questionnaire_template",
    targetId: templateId,
  });
  revalidatePath(`/${slug}/questionnaires`);
  return {};
}
