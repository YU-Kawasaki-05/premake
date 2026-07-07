import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type ClinicRole = "owner" | "doctor" | "staff";

/** リクエスト内で共有されるユーザー取得(検証付き) */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const isOps = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_ops")
    .eq("id", user.id)
    .maybeSingle();
  return data?.is_ops ?? false;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

type Clinic = Tables<"clinics">;
type Member = Tables<"clinic_members">;

/** ops 用の擬似メンバー(院内 UI は roles/display_name のみ参照する) */
function opsPseudoMember(clinicId: string, userId: string): Member {
  return {
    id: `ops:${userId}`,
    clinic_id: clinicId,
    user_id: userId,
    roles: ["owner", "doctor", "staff"],
    employment_type: null,
    display_name: "運営",
    is_bookable: false,
    status: "active",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

/**
 * クリニックアクセスの検証。三層防御の第2層(第1層 proxy セッション、第3層 RLS)。
 * - 所属メンバー: そのメンバーとして通す
 * - ops(プラットフォーム管理者): 全クリニックに擬似 owner として通す
 * - それ以外のログイン済みユーザー: notFound(存在を秘匿)
 * cache でメモ化し、layout と page の二重クエリを避ける。
 */
export const requireMemberBase = cache(async (clinicSlug: string) => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("*, clinic_members(*)")
    .eq("slug", clinicSlug)
    .maybeSingle<Clinic & { clinic_members: Member[] }>();

  if (!clinic) notFound();

  const member = clinic.clinic_members.find(
    (m) => m.user_id === user.id && m.status === "active",
  );

  if (member) {
    const { clinic_members: _omit, ...clinicRow } = clinic;
    return { user, clinic: clinicRow as Clinic, member };
  }

  if (await isOps()) {
    const { clinic_members: _omit, ...clinicRow } = clinic;
    return { user, clinic: clinicRow as Clinic, member: opsPseudoMember(clinic.id, user.id) };
  }

  notFound();
});

export async function requireMember(clinicSlug: string, role?: ClinicRole) {
  const result = await requireMemberBase(clinicSlug);
  if (role && !result.member.roles.includes(role)) redirect(`/${clinicSlug}`);
  return result;
}

export async function requireOps() {
  const user = await requireUser();
  if (!(await isOps())) redirect("/");
  return user;
}
