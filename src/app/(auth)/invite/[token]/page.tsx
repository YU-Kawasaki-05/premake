import type { Metadata } from "next";
import { AcceptInviteForm } from "@/features/invitations/components/accept-invite-form";
import { CurrentUserJoin } from "@/features/invitations/components/current-user-join";
import { verifyInvitation } from "@/features/invitations/verify";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "招待の確認" };

// @implements v2-02
export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const invitation = await verifyInvitation(token);

  if (!invitation) {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <h1 className="text-base font-semibold">招待リンクが無効です</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          リンクの有効期限が切れているか、すでに使用されています。招待した方に再発行を依頼してください。
        </p>
      </div>
    );
  }

  const user = await getUser();

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="text-base font-semibold">{invitation.clinic.name} への招待</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {invitation.email} 宛の招待です。
      </p>
      {user ? (
        <CurrentUserJoin
          token={token}
          invitedEmail={invitation.email}
          currentEmail={user.email ?? ""}
        />
      ) : (
        <AcceptInviteForm token={token} />
      )}
    </div>
  );
}
