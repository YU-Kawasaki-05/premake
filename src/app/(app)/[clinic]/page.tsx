import { formatInTimeZone } from "date-fns-tz";
import type { Metadata } from "next";
import { DayLedger } from "@/features/bookings/components/day-ledger";
import { requireMember } from "@/lib/auth";
import { TIME_ZONE } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "予約台帳" };

type BusinessHour = { dow: number; open: string; close: string };

// @implements v2-09 予約台帳(日ビュー)
export default async function LedgerPage(props: PageProps<"/[clinic]">) {
  const { clinic: slug } = await props.params;
  const sp = await props.searchParams;
  const { clinic, member } = await requireMember(slug);
  const supabase = await createClient();

  const todayJst = formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
  const date = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : todayJst;

  // その日の営業時間(曜日)→ 表示レンジ。なければ 9:00-19:00
  const dow = Number(formatInTimeZone(new Date(`${date}T00:00:00+09:00`), TIME_ZONE, "i")) % 7;
  const hours = (clinic.business_hours as BusinessHour[] | null) ?? [];
  const todayHours = hours.find((h) => h.dow === dow);
  const openMin = todayHours ? toMin(todayHours.open) : 9 * 60;
  const closeMin = todayHours ? toMin(todayHours.close) : 19 * 60;

  const dayStart = new Date(`${date}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${date}T23:59:59+09:00`).toISOString();
  const rangeLit = `[${dayStart},${dayEnd})`;

  const [
    { data: sessions },
    { data: blocks },
    { data: rooms },
    { data: members },
    { data: services },
  ] = await Promise.all([
    supabase
      .from("booking_sessions")
      .select(
        // 複合 FK(20260722000005)追加で bookings/patients/services への関係が各2本になり
        // PostgREST の埋め込みが曖昧になるため、単一 FK を明示指定して従来の解決先を保つ
        "id, seq, kind, label, member_id, room_id, time_range, status, booking:bookings!booking_sessions_booking_id_fkey(id, status, booking_no, notes, patient_id, guest_name, guest_kana, guest_phone, guest_email, patient:patients!bookings_patient_id_fkey(name), service:services!bookings_service_id_fkey(name))",
      )
      .eq("clinic_id", clinic.id)
      .overlaps("time_range", rangeLit)
      .order("time_range"),
    supabase
      .from("schedule_blocks")
      .select("id, member_id, room_id, block_type, time_range")
      .eq("clinic_id", clinic.id)
      .overlaps("time_range", rangeLit),
    supabase
      .from("rooms")
      .select("id, name")
      .eq("clinic_id", clinic.id)
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("clinic_members")
      .select("id, display_name, is_bookable, profiles(full_name)")
      .eq("clinic_id", clinic.id)
      .eq("status", "active"),
    supabase
      .from("services")
      .select("id, name, session_template")
      .eq("clinic_id", clinic.id)
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const memberOptions = (members ?? []).map((m) => ({
    id: m.id,
    name: m.display_name || m.profiles?.full_name || "(未設定)",
    bookable: m.is_bookable,
  }));

  return (
    <DayLedger
      slug={slug}
      date={date}
      todayJst={todayJst}
      openMin={openMin}
      closeMin={closeMin}
      rooms={(rooms ?? []).map((r) => ({ id: r.id, name: r.name }))}
      members={memberOptions}
      // biome-ignore lint/suspicious/noExplicitAny: supabase のネスト select 型は any 扱い(表示専用)
      sessions={(sessions ?? []) as any[]}
      // biome-ignore lint/suspicious/noExplicitAny: 同上
      blocks={(blocks ?? []) as any[]}
      // biome-ignore lint/suspicious/noExplicitAny: session_template を JSON として渡す
      services={(services ?? []) as any[]}
      currentMemberId={member.id}
    />
  );
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
