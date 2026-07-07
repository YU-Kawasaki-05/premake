import type { Metadata } from "next";
import Link from "next/link";
import { requireOps } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "利用計測" };

// @implements v2-26 ops 利用計測(直近7日の採用状況 KPI)
export default async function OpsMetricsPage() {
  await requireOps();
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: clinics } = await supabase
    .from("clinics")
    .select("id, name, slug")
    .order("created_at");

  const rows = await Promise.all(
    (clinics ?? []).map(async (c) => {
      const [{ data: bookings }, { data: audits }] = await Promise.all([
        supabase
          .from("bookings")
          .select("status, source, created_at")
          .eq("clinic_id", c.id)
          .gte("created_at", since),
        supabase
          .from("audit_logs")
          .select("created_at")
          .eq("clinic_id", c.id)
          .gte("created_at", since)
          .limit(2000),
      ]);
      const total = bookings?.length ?? 0;
      const cancelled = (bookings ?? []).filter(
        (b) => b.status === "cancelled" || b.status === "no_show",
      ).length;
      const web = (bookings ?? []).filter((b) => b.source === "web").length;
      const activeDays = new Set(
        (audits ?? []).map((a) => new Date(a.created_at).toISOString().slice(0, 10)),
      ).size;
      return {
        ...c,
        total,
        web,
        phone: total - web,
        cancelRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        activeDays,
      };
    }),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">利用計測(直近7日)</h1>
        <Link
          href="/ops"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          テナント一覧 →
        </Link>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        検証指標: アクティブ日数(週2日未満は撤退シグナル)/ 予約経路 / キャンセル率。
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[var(--paper)] text-left text-[12.5px] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">クリニック</th>
              <th className="px-4 py-2.5 font-medium">アクティブ日数</th>
              <th className="px-4 py-2.5 font-medium">予約数(Web/電話)</th>
              <th className="px-4 py-2.5 font-medium">キャンセル率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--line-soft)] last:border-0">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 tabular-nums">
                  <span className={r.activeDays < 2 ? "text-[var(--status-no-show)]" : ""}>
                    {r.activeDays} 日
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {r.total}
                  <span className="ml-1 text-[12.5px] text-muted-foreground">
                    ({r.web}/{r.phone})
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{r.cancelRate}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  クリニックがありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
