import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/actions";
import { generateInviteToken } from "@/features/invitations/token";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "招待の確認" };

/**
 * 所属ゼロだが招待を持つユーザーの受け皿。
 * 招待の生トークンは DB にハッシュしか無いため、ここでは受諾用の新トークンを再発行して
 * 既存の招待レコードに紐付け直し、/invite/[token] へ渡す。
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

  // 各招待に受諾用トークンを再発行(既存 token_hash を差し替え)
  const items: { id: string; name: string; token: string }[] = [];
  for (const inv of invitations ?? []) {
    const name = inv.clinics?.name;
    if (!name) continue;
    const { token, tokenHash } = generateInviteToken();
    await admin.from("invitations").update({ token_hash: tokenHash }).eq("id", inv.id);
    items.push({ id: inv.id, name, token });
  }

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
              <Button asChild size="sm">
                <Link href={`/invite/${item.token}`}>参加する</Link>
              </Button>
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
