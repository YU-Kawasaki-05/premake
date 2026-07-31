"use server";

// @implements v2-06 部屋管理 / v2-07 担当設定

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type RoomFormState = { error?: string; saved?: boolean };

const roomSchema = z.object({
  name: z.string().min(1, "部屋名を入力してください").max(50),
});

export async function createRoom(
  slug: string,
  _prev: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> {
  const { user, clinic } = await requireMember(slug, "owner");
  const parsed = roomSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic.id);

  const { data, error } = await supabase
    .from("rooms")
    .insert({ clinic_id: clinic.id, name: parsed.data.name, sort_order: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[rooms] create failed", error);
    return { error: "部屋の作成に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "room.create",
    targetType: "room",
    targetId: data.id,
    diff: { name: parsed.data.name },
  });
  revalidatePath(`/${slug}/rooms`);
  return { saved: true };
}

export async function updateRoom(
  slug: string,
  roomId: string,
  _prev: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> {
  const { user, clinic } = await requireMember(slug, "owner");
  const parsed = roomSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("rooms")
    .update({ name: parsed.data.name })
    .eq("id", roomId)
    .eq("clinic_id", clinic.id);
  if (error) {
    console.error("[rooms] update failed", error);
    return { error: "保存に失敗しました" };
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "room.update",
    targetType: "room",
    targetId: roomId,
  });
  revalidatePath(`/${slug}/rooms`);
  return { saved: true };
}

export async function setRoomStatus(slug: string, roomId: string, archived: boolean) {
  const { user, clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();
  const { error } = await supabase
    .from("rooms")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", roomId)
    .eq("clinic_id", clinic.id);
  if (error) return { error: "変更に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: archived ? "room.archive" : "room.restore",
    targetType: "room",
    targetId: roomId,
  });
  revalidatePath(`/${slug}/rooms`);
  return {};
}

export async function setAssignment(
  slug: string,
  memberId: string,
  serviceId: string,
  enabled: boolean,
) {
  const { user, clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();

  // 対象 member と service がこのクリニックのものか検証(越境防止)
  const [{ data: targetMember }, { data: service }] = await Promise.all([
    supabase
      .from("clinic_members")
      .select("id")
      .eq("id", memberId)
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
    supabase
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .eq("clinic_id", clinic.id)
      .maybeSingle(),
  ]);
  if (!targetMember) return { error: "スタッフが見つかりません" };
  if (!service) return { error: "メニューが見つかりません" };

  let assignmentId: string | undefined;
  if (enabled) {
    const { data, error } = await supabase
      .from("staff_service_assignments")
      .insert({
        clinic_id: clinic.id,
        member_id: memberId,
        service_id: serviceId,
      })
      .select("id")
      .maybeSingle();
    // 23505 = unique_violation(既に割当済み)。冪等に成功扱いする。
    if (error && error.code !== "23505") {
      console.error("[rooms] assignment create failed", error);
      return { error: "変更に失敗しました" };
    }
    assignmentId = data?.id;
  } else {
    const { data, error } = await supabase
      .from("staff_service_assignments")
      .delete()
      .eq("clinic_id", clinic.id)
      .eq("member_id", memberId)
      .eq("service_id", serviceId)
      .select("id");
    if (error) {
      console.error("[rooms] assignment delete failed", error);
      return { error: "変更に失敗しました" };
    }
    assignmentId = data?.[0]?.id;
  }

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: enabled ? "assignment.create" : "assignment.delete",
    targetType: "staff_service_assignment",
    // audit_logs.target_id は uuid 型。複合キー(member:service)は入らないので
    // 割当行の id を入れ、対象スタッフ・メニューは diff で辿れるようにする。
    targetId: assignmentId,
    diff: { memberId, serviceId, assigned: enabled },
  });
  revalidatePath(`/${slug}/rooms`);
  return {};
}
