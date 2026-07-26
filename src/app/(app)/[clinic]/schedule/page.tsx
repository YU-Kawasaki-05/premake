import { formatInTimeZone } from "date-fns-tz";
import type { Metadata } from "next";
import { ScheduleWeekView } from "@/features/schedule/components/schedule-week-view";
import { weekDays } from "@/features/schedule/week";
import { requireMember } from "@/lib/auth";
import { TIME_ZONE } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "施術枠" };

// @implements v2-08
export default async function SchedulePage(props: PageProps<"/[clinic]/schedule">) {
  const { clinic: slug } = await props.params;
  const sp = await props.searchParams;
  const { clinic, member } = await requireMember(slug);
  const supabase = await createClient();

  // 「今日」(JST)。anchor は ?w= で指定された週、なければ今日
  const todayJst = formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
  const anchor = typeof sp.w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? sp.w : todayJst;
  const days = weekDays(anchor, todayJst);

  const weekStart = `${days[0].date}T00:00:00+09:00`;
  const weekEnd = `${days[6].date}T23:59:59+09:00`;

  const [{ data: blocks }, { data: members }, { data: rooms }] = await Promise.all([
    supabase
      .from("schedule_blocks")
      .select("id, member_id, room_id, block_type, note, time_range")
      .eq("clinic_id", clinic.id)
      .overlaps(
        "time_range",
        `[${new Date(weekStart).toISOString()},${new Date(weekEnd).toISOString()})`,
      )
      .order("time_range"),
    supabase
      .from("clinic_members")
      .select("id, display_name, profiles(full_name)")
      .eq("clinic_id", clinic.id)
      .eq("status", "active"),
    supabase
      .from("rooms")
      .select("id, name")
      .eq("clinic_id", clinic.id)
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const memberOptions = (members ?? []).map((m) => ({
    id: m.id,
    name: m.display_name || m.profiles?.full_name || "(未設定)",
  }));
  const roomOptions = (rooms ?? []).map((r) => ({ id: r.id, name: r.name }));

  // time_range は Postgres tstzrange のため生成型が unknown。文字列として正規化する。
  const blockRows = (blocks ?? []).map((b) => ({ ...b, time_range: String(b.time_range) }));

  return (
    <ScheduleWeekView
      slug={slug}
      anchor={anchor}
      days={days}
      blocks={blockRows}
      members={memberOptions}
      rooms={roomOptions}
      currentMemberId={member.id}
    />
  );
}
