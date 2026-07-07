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

/**
 * 名寄せ: source(ゲスト予約由来など)を target に統合する。
 * source の予約を target に付け替え、source を削除する。
 */
export async function mergePatients(slug: string, sourceId: string, targetId: string) {
  const { user, clinic } = await requireMember(slug, "owner");
  if (sourceId === targetId) return { error: "同一患者は統合できません" };

  const supabase = await createClient();
  const { data: both } = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinic.id)
    .in("id", [sourceId, targetId]);
  if (both?.length !== 2) return { error: "患者が見つかりません" };

  // 予約を付け替え
  const { error: reassignErr } = await supabase
    .from("bookings")
    .update({ patient_id: targetId })
    .eq("clinic_id", clinic.id)
    .eq("patient_id", sourceId);
  if (reassignErr) return { error: "予約の付け替えに失敗しました" };

  const { error: delErr } = await supabase
    .from("patients")
    .delete()
    .eq("id", sourceId)
    .eq("clinic_id", clinic.id);
  if (delErr) return { error: "統合元の削除に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "patient.merge",
    targetType: "patient",
    targetId: targetId,
    diff: { merged_from: sourceId },
  });
  revalidatePath(`/${slug}/patients`);
  return { ok: true };
}
