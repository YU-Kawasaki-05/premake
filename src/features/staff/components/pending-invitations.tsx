"use client";

// @implements v2-02 保留中の招待一覧

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeInvitation } from "@/features/staff/actions";
import { ROLE_LABELS } from "@/features/staff/labels";
import { formatDate } from "@/lib/datetime";

type Invitation = {
  id: string;
  email: string;
  roles: string[];
  created_at: string;
  expires_at: string;
};

export function PendingInvitations({
  slug,
  invitations,
}: {
  slug: string;
  invitations: Invitation[];
}) {
  const [pending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">承諾待ちの招待</h2>
      <ul className="mt-3 space-y-2">
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5 text-sm"
          >
            <div>
              <span className="font-medium">{invitation.email}</span>
              <span className="ml-2 text-[12.5px] text-muted-foreground">
                {invitation.roles.map((role) => ROLE_LABELS[role] ?? role).join("・")} / 期限{" "}
                {formatDate(invitation.expires_at)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending && revoking === invitation.id}
              onClick={() => {
                setRevoking(invitation.id);
                startTransition(async () => {
                  const result = await revokeInvitation(slug, invitation.id);
                  if (result?.error) toast.error(result.error);
                  else toast.success("招待を取り消しました");
                });
              }}
            >
              取り消す
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
