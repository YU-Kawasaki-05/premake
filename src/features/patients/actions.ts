"use server";

// @implements v2-15 患者マスタ / v2-16 名寄せ

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PatientFormState = { error?: string; saved?: boolean; patientId?: string };

const patientSchema = z.object({
  name: z.string().trim().min(1, "氏名を入力してください").max(60),
  kana: z.string().trim().max(60).optional(),
  birthdate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  externalChartNo: z.string().trim().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

function parse(formData: FormData) {
  return patientSchema.safeParse({
    name: formData.get("name"),
    kana: formData.get("kana") || undefined,
    birthdate: formData.get("birthdate") ?? "",
    phone: formData.get("phone") || undefined,
    email: formData.get("email") ?? "",
    externalChartNo: formData.get("externalChartNo") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function createPatient(
  slug: string,
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const { user, clinic } = await requireMember(slug);
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinic.id,
      name: d.name,
      kana: d.kana || null,
      birthdate: d.birthdate || null,
      phone: d.phone || null,
      email: d.email || null,
      external_chart_no: d.externalChartNo || null,
      notes: d.notes || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[patients] create failed", error);
    return { error: "患者の登録に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "patient.create",
    targetType: "patient",
    targetId: data.id,
  });
  revalidatePath(`/${slug}/patients`);
  return { saved: true, patientId: data.id };
}

export async function updatePatient(
  slug: string,
  patientId: string,
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const { user, clinic } = await requireMember(slug);
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({
      name: d.name,
      kana: d.kana || null,
      birthdate: d.birthdate || null,
      phone: d.phone || null,
      email: d.email || null,
      external_chart_no: d.externalChartNo || null,
      notes: d.notes || null,
    })
    .eq("id", patientId)
    .eq("clinic_id", clinic.id);
  if (error) {
    console.error("[patients] update failed", error);
    return { error: "保存に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "patient.update",
    targetType: "patient",
    targetId: patientId,
  });
  revalidatePath(`/${slug}/patients/${patientId}`);
  revalidatePath(`/${slug}/patients`);
  return { saved: true };
}

// 名寄せ(v2-16 / 台帳 No.14)は未実装。旧 mergePatients は呼び出し元ゼロの死蔵コードで、
// source 患者を物理削除し notes/tags/birthdate を破棄する破壊的・非トランザクション実装だったため削除した。
// 実装時は「候補提示 → 受付が確認して紐付け(自動マージしない)」+ 論理削除 + RPC 原子化で作り直すこと。
