import { CalendarDays, Settings, Users } from "lucide-react";
import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { requireMember } from "@/lib/auth";

// @implements v2-01, v2-03 院内アプリの共通シェル
export default async function ClinicLayout({ children, params }: LayoutProps<"/[clinic]">) {
  const { clinic: slug } = await params;
  const { clinic, member } = await requireMember(slug);
  const isOwner = member.roles.includes("owner");

  const nav = [
    { href: `/${slug}`, label: "ホーム", icon: CalendarDays, show: true },
    { href: `/${slug}/staff`, label: "スタッフ", icon: Users, show: isOwner },
    { href: `/${slug}/settings`, label: "クリニック設定", icon: Settings, show: isOwner },
  ].filter((item) => item.show);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-[var(--paper)] md:flex">
        <div className="flex h-12 items-center border-b border-[var(--line-soft)] px-4">
          <Link href={`/${slug}`} className="truncate text-sm font-semibold">
            {clinic.name}
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="メイン">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)]"
            >
              <item.icon className="size-4 text-muted-foreground" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[var(--line-soft)] px-4 py-3">
          <p className="truncate text-[12.5px] text-muted-foreground">
            {member.display_name || "スタッフ"}
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="mt-1 text-[12.5px] text-muted-foreground underline-offset-4 hover:underline"
            >
              ログアウト
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-6 md:px-8">{children}</main>
    </div>
  );
}
