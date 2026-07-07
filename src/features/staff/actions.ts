"use server";

// @implements v2-02 スタッフ管理(招待・編集)

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createInvitation } from "@/features/invitations/create";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type InviteStaffState = { error?: string; inviteUrl?: string };
export type UpdateMemberState = { error?: string; saved?: boolean };

const ROLE_VALUES = ["owner", "doctor", "staff"] as const;

const inviteSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  roles: z.array(z.enum(ROLE_VALUES)).min(1, "ロールを1つ以上選択してください"),
  employmentType: z.enum(["employed", "contracted"]).optional(),
});

export async function inviteStaff(
  slug: string,
  _prev: InviteStaffState,
  formData: FormData,
): Promise<InviteStaffState> {
  const { user, clinic } = await requireMember(slug, "owner");

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    roles: ROLE_VALUES.filter((role) => formData.get(`role-${role}`) === "on"),
    employmentType: formData.get("employmentType") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();

  // 既に有効な招待が同一メールに存在する場合は重複発行しない
  const { count: dupInvites } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinic.id)
    .eq("email", parsed.data.email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());
  if ((dupInvites ?? 0) > 0) {
    return { error: "このメールアドレスには承諾待ちの招待が既にあります" };
  }

  const { inviteUrl } = await createInvitation({
    clinicId: clinic.id,
    email: parsed.data.email,
    roles: parsed.data.roles,
    employmentType: parsed.data.employmentType,
    createdBy: user.id,
    actorType: "member",
  });

  revalidatePath(`/${slug}/staff`);
  return { inviteUrl };
}

const updateMemberSchema = z.object({
  memberId: z.uuid(),
  roles: z.array(z.enum(ROLE_VALUES)).min(1, "ロールを1つ以上選択してください"),
  employmentType: z.enum(["employed", "contracted"]).optional(),
  displayName: z.string().max(30).optional(),
  isBookable: z.boolean(),
  status: z.enum(["active", "inactive"]),
});

export async function updateMember(
  slug: string,
  _prev: UpdateMemberState,
  formData: FormData,
): Promise<UpdateMemberState> {
  const { user, clinic } = await requireMember(slug, "owner");

  const parsed = updateMemberSchema.safeParse({
    memberId: formData.get("memberId"),
    roles: ROLE_VALUES.filter((role) => formData.get(`role-${role}`) === "on"),
    employmentType: formData.get("employmentType") || undefined,
    displayName: formData.get("displayName") ?? undefined,
    isBookable: formData.get("isBookable") === "on",
    status: formData.get("status") === "inactive" ? "inactive" : "active",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();

  // 対象がこのクリニックのメンバーであることを確認(memberId の横断改ざん防止)
  const { data: target } = await supabase
    .from("clinic_members")
    .select("id, roles, status")
    .eq("id", parsed.data.memberId)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!target) return { error: "対象のメンバーが見つかりません" };

  // owner 不在事故の防止: 最後の active owner から owner を外す/無効化する操作は拒否
  const losesOwner =
    target.roles.includes("owner") &&
    (!parsed.data.roles.includes("owner") || parsed.data.status === "inactive");
  if (losesOwner) {
    const { count } = await supabase
      .from("clinic_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinic.id)
      .eq("status", "active")
      .contains("roles", ["owner"]);
    if ((count ?? 0) <= 1) {
      return { error: "管理者が不在になるため変更できません。先に別の管理者を追加してください" };
    }
  }

  const { error } = await supabase
    .from("clinic_members")
    .update({
      roles: parsed.data.roles,
      employment_type: parsed.data.employmentType ?? null,
      display_name: parsed.data.displayName || null,
      is_bookable: parsed.data.isBookable,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.memberId)
    .eq("clinic_id", clinic.id);
  if (error) return { error: "保存に失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "member.update",
    targetType: "clinic_member",
    targetId: parsed.data.memberId,
    diff: {
      roles: parsed.data.roles,
      status: parsed.data.status,
      is_bookable: parsed.data.isBookable,
    },
  });
  revalidatePath(`/${slug}/staff`);
  return { saved: true };
}

export async function revokeInvitation(slug: string, invitationId: string) {
  const { user, clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();

  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .eq("clinic_id", clinic.id)
    .is("accepted_at", null);
  if (error) return { error: "取り消しに失敗しました" };

  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "invitation.revoke",
    targetType: "invitation",
    targetId: invitationId,
  });
  revalidatePath(`/${slug}/staff`);
  return {};
}
