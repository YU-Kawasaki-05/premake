import { formatInTimeZone } from "date-fns-tz";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { availableSlots } from "@/features/public-booking/availability";
import { ReserveFlow } from "@/features/public-booking/components/reserve-flow";
import { getPublicClinic, getPublicServices } from "@/features/public-booking/data";
import { TIME_ZONE } from "@/lib/datetime";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(props: PageProps<"/c/[slug]/reserve">): Promise<Metadata> {
  const { slug } = await props.params;
  const clinic = await getPublicClinic(slug);
  return { title: { absolute: clinic ? `ご予約 | ${clinic.name}` : "ご予約" } };
}

// @implements v2-20 ゲスト予約フロー
export default async function ReservePage(props: PageProps<"/c/[slug]/reserve">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const clinic = await getPublicClinic(slug);
  if (!clinic) notFound();

  const services = await getPublicServices(clinic.id);
  const serviceId = typeof sp.service === "string" ? sp.service : services[0]?.id;
  const service = services.find((s) => s.id === serviceId);
  if (!service) notFound();

  const todayJst = formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
  const date =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayJst;
  const nominated = typeof sp.member === "string" ? sp.member : null;

  const slots = await availableSlots({
    clinicId: clinic.id,
    serviceId: service.id,
    service,
    dateJst: date,
    nominatedMemberId: nominated,
  });

  // 指名候補(allow_nomination かつ bookable かつ当該サービスの担当割当があるスタッフ)。
  // 絞り込み基準は availableSlots と同一(No.9・No.34・BC-NEW-02)— 割当が無いスタッフを指名しても
  // 空き枠が 0 件になるため、チップ自体を出さない。
  // 公開文脈では profiles.full_name にフォールバックしない(本名露出防止 F8)。
  // display_name 未設定のスタッフは指名チップに出さない(空き枠には「指定なし」経由で出せる)。
  const nominees: { id: string; name: string }[] = [];
  if (service.allow_nomination) {
    const admin = createAdminClient();
    const [{ data: members }, { data: assignments }] = await Promise.all([
      admin
        .from("clinic_members")
        .select("id, display_name")
        .eq("clinic_id", clinic.id)
        .eq("status", "active")
        .eq("is_bookable", true),
      admin
        .from("staff_service_assignments")
        .select("member_id")
        .eq("clinic_id", clinic.id)
        .eq("service_id", service.id),
    ]);
    const assignedMemberIds = new Set((assignments ?? []).map((a) => a.member_id));
    for (const m of members ?? []) {
      if (m.display_name && assignedMemberIds.has(m.id)) {
        nominees.push({ id: m.id, name: m.display_name });
      }
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <ReserveFlow
        slug={slug}
        clinicName={clinic.name}
        service={{ id: service.id, name: service.name }}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        date={date}
        todayJst={todayJst}
        slots={slots}
        nominees={nominees}
        nominated={nominated}
      />
    </main>
  );
}
