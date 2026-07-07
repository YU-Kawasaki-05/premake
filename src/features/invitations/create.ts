import "server-only";

// @implements v2-02 スタッフ招待(発行側の共通ロジック)

import { env } from "@/env";
import { recordAudit } from "@/lib/audit";
import type { ClinicRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteToken } from "./token";

const INVITE_EXPIRY_DAYS = 7;

type CreateInvitationInput = {
  clinicId: string;
  email: string;
  roles: ClinicRole[];
  employmentType?: "employed" | "contracted";
  createdBy: string; // 認可済みの呼び出し元ユーザー(action 側で requireMember/requireOps 済み)
  actorType: "member" | "ops";
};

/**
 * 招待を発行し、受諾 URL を返す。
 * RESEND_API_KEY 未設定の間はメール送信せず、呼び出し元画面で URL を表示して手渡しする運用。
 */
export async function createInvitation(input: CreateInvitationInput) {
  const admin = createAdminClient();
  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await admin
    .from("invitations")
    .insert({
      clinic_id: input.clinicId,
      email: input.email,
      roles: input.roles,
      employment_type: input.employmentType ?? null,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[invite] createInvitation failed", error);
    throw new Error("招待の作成に失敗しました");
  }

  await recordAudit({
    clinicId: input.clinicId,
    actorUserId: input.createdBy,
    actorType: input.actorType,
    action: "invitation.create",
    targetType: "invitation",
    targetId: data.id,
    diff: { email: input.email, roles: input.roles },
  });

  const inviteUrl = `${env.APP_URL}/invite/${token}`;
  // TODO(S6): RESEND_API_KEY 設定後は React Email テンプレートで送信する(v2-23)
  return { invitationId: data.id, inviteUrl, expiresAt };
}
