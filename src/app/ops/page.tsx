import type { Metadata } from "next";
import { CreateClinicDialog } from "@/features/ops/components/create-clinic-dialog";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "テナント管理" };

// @implements v2-25
export default async function OpsPage() {
  const supabase = await createClient();
  const { data: clinics } = await supabase
    .from("clinics")
    .select("id, slug, name, public_booking_enabled, created_at, clinic_members(count)")
    .order("created_at", { ascending: true });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">クリニック</h1>
        <CreateClinicDialog />
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[var(--paper)] text-left text-[12.5px] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">名称</th>
              <th className="px-4 py-2.5 font-medium">slug</th>
              <th className="px-4 py-2.5 font-medium">メンバー</th>
              <th className="px-4 py-2.5 font-medium">公開予約</th>
              <th className="px-4 py-2.5 font-medium">作成日</th>
            </tr>
          </thead>
          <tbody>
            {(clinics ?? []).map((clinic) => (
              <tr key={clinic.id} className="border-b border-[var(--line-soft)] last:border-0">
                <td className="px-4 py-3 font-medium">
                  <a href={`/${clinic.slug}`} className="underline-offset-4 hover:underline">
                    {clinic.name}
                  </a>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{clinic.slug}</td>
                <td className="px-4 py-3 tabular-nums">{clinic.clinic_members[0]?.count ?? 0}</td>
                <td className="px-4 py-3">
                  {clinic.public_booking_enabled ? (
                    <span className="text-[var(--status-confirmed)]">オン</span>
                  ) : (
                    <span className="text-muted-foreground">オフ</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {new Date(clinic.created_at).toLocaleDateString("ja-JP")}
                </td>
              </tr>
            ))}
            {(clinics ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  クリニックがまだありません。「クリニックを追加」から作成してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
