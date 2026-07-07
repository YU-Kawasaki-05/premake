import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ホーム" };

// S1 時点の仮ホーム。S3 で予約台帳(v2-09)に置き換わる
export default async function ClinicHomePage(props: PageProps<"/[clinic]">) {
  const { clinic: slug } = await props.params;
  const { clinic, member } = await requireMember(slug);
  const supabase = await createClient();

  const [{ count: serviceCount }, { count: roomCount }, { count: memberCount }] = await Promise.all(
    [
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinic.id)
        .eq("status", "active"),
      supabase
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinic.id)
        .eq("status", "active"),
      supabase
        .from("clinic_members")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinic.id)
        .eq("status", "active"),
    ],
  );

  const isOwner = member.roles.includes("owner");

  const setup = [
    { label: "スタッフの登録", count: memberCount ?? 0, href: `/${slug}/staff`, min: 2 },
    { label: "メニューの登録", count: serviceCount ?? 0, href: `/${slug}`, min: 1 },
    { label: "施術室の登録", count: roomCount ?? 0, href: `/${slug}`, min: 1 },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-base font-semibold">{clinic.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        予約台帳は Sprint 3 で追加されます。まずは基本情報の整備からどうぞ。
      </p>

      {isOwner && (
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">セットアップ状況</h2>
          <ul className="mt-3 space-y-2">
            {setup.map((item) => (
              <li key={item.label} className="flex items-center justify-between text-sm">
                <span
                  className={
                    item.count >= item.min ? "text-muted-foreground line-through" : undefined
                  }
                >
                  {item.label}
                </span>
                <span className="tabular-nums text-muted-foreground">{item.count} 件</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] leading-5 text-muted-foreground">
            メニュー・施術室の管理画面は Sprint 2 で追加されます。
            <Link href={`/${slug}/settings`} className="underline underline-offset-4">
              クリニック設定
            </Link>
            は先に整備できます。
          </p>
        </section>
      )}
    </div>
  );
}
