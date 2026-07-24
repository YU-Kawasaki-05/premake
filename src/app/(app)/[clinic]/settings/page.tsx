import type { Metadata } from "next";
import { BusinessHoursForm } from "@/features/clinic-settings/components/business-hours-form";
import { ClinicProfileForm } from "@/features/clinic-settings/components/clinic-profile-form";
import { PublicSettingsForm } from "@/features/clinic-settings/components/public-settings-form";
import type { BusinessHour } from "@/features/clinic-settings/types";
import { NotificationLog } from "@/features/notifications/components/notification-log";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "クリニック設定" };

// @implements v2-03
export default async function SettingsPage(props: PageProps<"/[clinic]/settings">) {
  const { clinic: slug } = await props.params;
  const { clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();

  // notifications は member の RLS(notifications_select)で自クリニック分のみ閲覧可
  const { data: notifications } = await supabase
    .from("notifications")
    .select(
      "id, kind, recipient_email, recipient_type, status, attempts, error, created_at, sent_at",
    )
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-base font-semibold">クリニック設定</h1>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">基本情報</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          公開ページでは医療提供主体として、クリニック名・院長名・所在地が表示されます。
        </p>
        <ClinicProfileForm
          slug={slug}
          defaults={{
            name: clinic.name,
            director_name: clinic.director_name ?? "",
            postal_code: clinic.postal_code ?? "",
            address: clinic.address ?? "",
            phone: clinic.phone ?? "",
            email: clinic.email ?? "",
          }}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">営業時間</h2>
        <BusinessHoursForm slug={slug} defaults={clinic.business_hours as BusinessHour[]} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">オンライン予約</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          オフの間、患者向け公開ページは表示されません(院内管理のみで運用できます)。
        </p>
        <PublicSettingsForm
          slug={slug}
          defaults={{
            public_booking_enabled: clinic.public_booking_enabled,
            booking_approval_mode: clinic.booking_approval_mode as "auto" | "manual",
            cancel_deadline_hours: clinic.cancel_deadline_hours,
          }}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">通知の送信状況</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          直近 50 件のメール通知です。「失敗」は再試行上限に達したもので、自動再送されません。
        </p>
        <NotificationLog rows={notifications ?? []} />
      </section>
    </div>
  );
}
