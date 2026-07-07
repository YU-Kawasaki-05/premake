"use server";

// @implements v2-02 招待受諾(新規ユーザー / 既存ユーザー)

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyInvitation } from "./verify";

export type AcceptInviteState = {
  error?: string;
  /** 同メールの既存アカウントがある → ログインを促す */
  existingAccount?: boolean;
};

const signupSchema = z.object({
  fullName: z.string().min(1, "お名前を入力してください").max(60),
  password: z.string().min(8, "パスワードは8文字以上で設定してください"),
});

async function attachMemberAndAccept(params: {
  invitationId: string;
  clinicId: string;
  userId: string;
  roles: string[];
  employmentType: "employed" | "contracted" | null;
}) {
  const admin = createAdminClient();

  const { error: memberError } = await admin.from("clinic_members").insert({
    clinic_id: params.clinicId,
    user_id: params.userId,
    roles: params.roles,
    employment_type: params.employmentType,
  });
  // 23505 = 既にメンバー。受諾自体は成立として扱う
  if (memberError && memberError.code !== "23505") {
    console.error("[invite] member insert failed", memberError);
    throw new Error("メンバー登録に失敗しました");
  }

  // 未受諾のときだけ確定(二重受諾の窓を閉じる)
  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", params.invitationId)
    .is("accepted_at", null);

  await recordAudit({
    clinicId: params.clinicId,
    actorUserId: params.userId,
    actorType: "member",
    action: "invitation.accept",
    targetType: "invitation",
    targetId: params.invitationId,
  });
}

/** 新規ユーザーとして招待を受諾(アカウント作成 → 参加 → 自動ログイン) */
export async function acceptInviteAsNewUser(
  token: string,
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const invitation = await verifyInvitation(token);
  if (!invitation) return { error: "この招待リンクは無効か、有効期限が切れています" };

  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (createError || !created?.user) {
    if (createError?.code === "email_exists") {
      return { existingAccount: true };
    }
    console.error("[invite] createUser failed", createError);
    return { error: "アカウントの作成に失敗しました。時間をおいて再度お試しください" };
  }

  try {
    await attachMemberAndAccept({
      invitationId: invitation.id,
      clinicId: invitation.clinic.id,
      userId: created.user.id,
      roles: invitation.roles,
      employmentType: invitation.employment_type,
    });
  } catch (error) {
    // member 登録に失敗したら、確認済みの孤児アカウントを残さないよう補償削除する
    console.error("[invite] attachMember failed, rolling back user", error);
    await admin.auth.admin.deleteUser(created.user.id).catch((e) => {
      console.error("[invite] rollback deleteUser failed", e);
    });
    return { error: "参加処理に失敗しました。もう一度招待リンクを開いてお試しください" };
  }

  // 作成したパスワードでそのままログイン
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: parsed.data.password,
  });

  redirect(`/${invitation.clinic.slug}`);
}

/** ログイン中のユーザーとして招待を受諾(招待メールと一致するアカウントのみ) */
export async function acceptInviteAsCurrentUser(token: string): Promise<AcceptInviteState> {
  const user = await getUser();
  if (!user) return { error: "ログインしてから招待リンクを開き直してください" };

  const invitation = await verifyInvitation(token);
  if (!invitation) return { error: "この招待リンクは無効か、有効期限が切れています" };

  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return {
      error: `この招待は ${invitation.email} 宛です。該当アカウントでログインし直してください`,
    };
  }

  await attachMemberAndAccept({
    invitationId: invitation.id,
    clinicId: invitation.clinic.id,
    userId: user.id,
    roles: invitation.roles,
    employmentType: invitation.employment_type,
  });

  redirect(`/${invitation.clinic.slug}`);
}
