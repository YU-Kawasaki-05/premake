import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { openPendingInvitation } from "@/features/invitations/actions";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "招待の確認" };

/**
 * 所属ゼロだが招待を持つユーザーの受け皿。
 * 描画(GET)は一覧表示のみで副作用を持たない。受諾用トークンの再発行(ローテーション)は
 * 「参加する」ボタン(openPendingInvitation / POST)押下時にのみ行う(AUTH-4)。
 */
export default async function PendingInvitationsPage() {
  const user = await getUser();
  if (!user?.email) redirect("/login");

  const admin = createAdminClient();
  const { data: invitations } = await admin
    .from("invitations")
    .select("id, clinics(name)")
    .eq("email", user.email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());

  // 所属があるならホームへ(このページに留まる必要がない)
  const { data: membership } = await admin
    .from("clinic_members")
    .select("clinics(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membership?.clinics?.slug) redirect(`/${membership.clinics.slug}`);

  const items = (invitations ?? []).flatMap((inv) =>
    inv.clinics?.name ? [{ id: inv.id, name: inv.clinics.name }] : [],
  );

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="text-base font-semibold">参加できるクリニック</h1>
      {items.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          有効な招待が見つかりませんでした。管理者に再発行を依頼してください。
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm"
            >
              <span className="font-medium">{item.name}</span>
              <form action={openPendingInvitation.bind(null, item.id)}>
                <Button type="submit" size="sm">
                  参加する
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={logout} className="mt-4">
        <button
          type="submit"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
