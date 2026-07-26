import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/features/bookings/booking-status";
import { PatientFormDialog } from "@/features/patients/components/patient-form-dialog";
import { parseRange } from "@/features/schedule/week";
import { recordAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth";
import { formatDate, formatTimeRange } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "患者詳細" };

// @implements v2-15 患者詳細 / v2-18 問診回答閲覧(閲覧ログ)
export default async function PatientDetailPage(props: PageProps<"/[clinic]/patients/[id]">) {
  const { clinic: slug, id } = await props.params;
  const { user, clinic } = await requireMember(slug);
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!patient) notFound();

  // 要配慮情報へのアクセスを監査ログに残す
  await recordAudit({
    clinicId: clinic.id,
    actorUserId: user.id,
    actorType: "member",
    action: "patient.view",
    targetType: "patient",
    targetId: id,
  });

  const [{ data: bookings }, { data: responses }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_no, status, created_at, service:services!bookings_service_id_fkey(name), sessions:booking_sessions!booking_sessions_booking_id_fkey(time_range, status)",
      )
      .eq("clinic_id", clinic.id)
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("questionnaire_responses")
      .select(
        "id, submitted_at, template:questionnaire_templates!questionnaire_responses_template_id_fkey(name), booking_id",
      )
      .eq("clinic_id", clinic.id)
      .in(
        "booking_id",
        (
          await supabase
            .from("bookings")
            .select("id")
            .eq("clinic_id", clinic.id)
            .eq("patient_id", id)
        ).data?.map((b) => b.id) ?? ["00000000-0000-0000-0000-000000000000"],
      ),
  ]);

  return (
    <div className="max-w-3xl">
      <Link
        href={`/${slug}/patients`}
        className="text-[12.5px] text-muted-foreground underline-offset-4 hover:underline"
      >
        ← 患者一覧
      </Link>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{patient.name}</h1>
          {patient.kana && <p className="text-[12.5px] text-muted-foreground">{patient.kana}</p>}
        </div>
        <PatientFormDialog
          slug={slug}
          patient={patient}
          trigger={
            <Button variant="outline" size="sm">
              編集
            </Button>
          }
        />
      </div>

      <section className="mt-4 grid gap-x-6 gap-y-2 rounded-lg border border-border bg-card p-5 text-sm sm:grid-cols-2">
        <Field label="生年月日" value={patient.birthdate ? formatDate(patient.birthdate) : "—"} />
        <Field label="電話" value={patient.phone || "—"} />
        <Field label="メール" value={patient.email || "—"} />
        <Field label="外部カルテ番号" value={patient.external_chart_no || "—"} />
        {patient.notes && (
          <div className="sm:col-span-2">
            <p className="text-[12.5px] text-muted-foreground">院内メモ</p>
            <p className="mt-0.5 whitespace-pre-wrap">{patient.notes}</p>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">予約・施術履歴</h2>
        {(bookings ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">履歴はありません。</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(bookings ?? []).map((b) => {
              const firstSession = b.sessions?.[0];
              const r = firstSession ? parseRange(firstSession.time_range as string) : null;
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5 text-sm"
                >
                  <div>
                    <span className="font-medium">{b.service?.name ?? "—"}</span>
                    <span className="ml-2 text-[12.5px] text-muted-foreground tabular-nums">
                      {r ? formatTimeRange(r.start, r.end) : formatDate(b.created_at)}
                    </span>
                  </div>
                  <span className="text-[12.5px] text-muted-foreground">
                    {BOOKING_STATUS_LABELS[b.status as BookingStatus] ?? b.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">問診回答</h2>
        {(responses ?? []).filter((r) => r.submitted_at).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">提出済みの問診はありません。</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(responses ?? [])
              .filter((r) => r.submitted_at)
              .map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5 text-sm"
                >
                  <span>{r.template?.name ?? "問診"}</span>
                  <span className="text-[12.5px] text-muted-foreground tabular-nums">
                    {r.submitted_at ? formatDate(r.submitted_at) : ""}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
