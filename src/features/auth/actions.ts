"use server";

// @implements v2-01 スタッフ認証

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/env";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

/** ログイン後の行き先: ops → /ops、所属あり → /[slug]、どちらでもない → エラー */
async function resolveHomePath(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_ops")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_ops) return "/ops";

  const { data: membership } = await supabase
    .from("clinic_members")
    .select("clinics(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const slug = membership?.clinics?.slug;
  return slug ? `/${slug}` : null;
}

/** ログイン中ユーザー宛の未受諾・有効な招待が存在するか(所属ゼロ時のデッドロック回避) */
async function hasPendingInvitation(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());
  return (count ?? 0) > 0;
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  // React 19 は action 送信後にフォームをリセットするため、エラー時は email を返して復元する
  const enteredEmail = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
      email: enteredEmail,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // 侵害検知のためログイン失敗を記録(email/IP は audit の headers 経由)
    await recordAudit({
      actorType: "guest",
      action: "auth.login_failed",
      diff: { email: enteredEmail },
    });
    return { error: "メールアドレスまたはパスワードが正しくありません", email: enteredEmail };
  }

  const home = await resolveHomePath();
  if (!home) {
    // 所属ゼロでも未受諾の招待があれば、受諾ページへ誘導(デッドロック回避)
    if (data.user.email && (await hasPendingInvitation(data.user.email))) {
      await recordAudit({ actorUserId: data.user.id, actorType: "member", action: "auth.login" });
      redirect("/pending-invitations");
    }
    await supabase.auth.signOut();
    return {
      error: "このアカウントに所属先がありません。管理者にお問い合わせください",
      email: enteredEmail,
    };
  }

  await recordAudit({
    actorUserId: data.user.id,
    actorType: "member",
    action: "auth.login",
  });
  redirect(home);
}

export async function logout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  if (user) {
    await recordAudit({ actorUserId: user.id, actorType: "member", action: "auth.logout" });
  }
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: AuthFormState & { done?: boolean },
  formData: FormData,
): Promise<AuthFormState & { done?: boolean }> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "メールアドレスの形式が正しくありません" };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${env.APP_URL}/auth/callback?next=/reset-password/update`,
  });
  // 存在しないメールでも同じ応答(列挙攻撃対策)
  return { done: true };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = z
    .string()
    .min(8, "8文字以上で設定してください")
    .safeParse(formData.get("password"));
  if (!password.success) return { error: password.error.issues[0]?.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "パスワードを更新できませんでした。もう一度お試しください" };

  if (user) {
    await recordAudit({
      actorUserId: user.id,
      actorType: "member",
      action: "auth.password_update",
    });
  }
  const home = await resolveHomePath();
  redirect(home ?? "/login");
}
