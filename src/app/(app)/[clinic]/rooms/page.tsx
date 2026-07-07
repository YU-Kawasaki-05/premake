import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { AssignmentMatrix } from "@/features/rooms/components/assignment-matrix";
import { RoomFormDialog } from "@/features/rooms/components/room-form-dialog";
import { RoomListItem } from "@/features/rooms/components/room-list-item";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "部屋・担当設定" };

// @implements v2-06 部屋管理 / v2-07 担当設定
export default async function RoomsPage(props: PageProps<"/[clinic]/rooms">) {
  const { clinic: slug } = await props.params;
  const { clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();

  const [{ data: rooms }, { data: members }, { data: services }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("clinic_id", clinic.id)
        .order("status", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("clinic_members")
        .select("id, display_name, is_bookable, profiles(full_name)")
        .eq("clinic_id", clinic.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      supabase
        .from("services")
        .select("id, name")
        .eq("clinic_id", clinic.id)
        .eq("status", "active")
        .order("sort_order", { ascending: true }),
      supabase
        .from("staff_service_assignments")
        .select("member_id, service_id")
        .eq("clinic_id", clinic.id),
    ]);

  const roomList = rooms ?? [];
  const activeMembers = members ?? [];
  const bookableMembers = activeMembers.filter((m) => m.is_bookable);
  const staffRows = bookableMembers.length > 0 ? bookableMembers : activeMembers;
  const serviceList = services ?? [];
  const assignedKeys = (assignments ?? []).map((a) => `${a.member_id}:${a.service_id}`);

  return (
    <div className="max-w-5xl space-y-8">
      <h1 className="text-base font-semibold">部屋・担当設定</h1>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">部屋</h2>
          <RoomFormDialog slug={slug} trigger={<Button>部屋を追加</Button>} />
        </div>

        {roomList.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            部屋がまだありません。「部屋を追加」から登録してください。
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {roomList.map((room) => (
              <RoomListItem key={room.id} slug={slug} room={room} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">担当設定</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          スタッフが担当できるメニューを設定します(指名可能なスタッフのみ表示)。
        </p>
        <AssignmentMatrix
          slug={slug}
          members={staffRows.map((m) => ({
            id: m.id,
            name: m.profiles?.full_name || m.display_name || "(未設定)",
          }))}
          services={serviceList}
          initialAssigned={assignedKeys}
        />
      </section>
    </div>
  );
}
