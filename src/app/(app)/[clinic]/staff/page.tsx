import type { Metadata } from "next";
import { InviteStaffDialog } from "@/features/staff/components/invite-staff-dialog";
import { MemberRow } from "@/features/staff/components/member-row";
import { PendingInvitations } from "@/features/staff/components/pending-invitations";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "スタッフ" };

// @implements v2-02
export default async function StaffPage(props: PageProps<"/[clinic]/staff">) {
  const { clinic: slug } = await props.params;
  const { clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("clinic_members")
      .select("*, profiles(full_name)")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, roles, created_at, expires_at")
      .eq("clinic_id", clinic.id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">スタッフ</h1>
        <InviteStaffDialog slug={slug} />
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[var(--paper)] text-left text-[12.5px] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">名前</th>
              <th className="px-4 py-2.5 font-medium">ロール</th>
              <th className="px-4 py-2.5 font-medium">雇用区分</th>
              <th className="px-4 py-2.5 font-medium">指名</th>
              <th className="px-4 py-2.5 font-medium">状態</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => (
              <MemberRow key={member.id} slug={slug} member={member} />
            ))}
          </tbody>
        </table>
      </div>

      <PendingInvitations slug={slug} invitations={invitations ?? []} />
    </div>
  );
}
