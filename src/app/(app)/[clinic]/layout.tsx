import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { MobileNav } from "@/features/shell/mobile-nav";
import type { NavItem } from "@/features/shell/nav-icons";
import { SidebarNav } from "@/features/shell/sidebar-nav";
import { requireMember } from "@/lib/auth";

// @implements v2-01, v2-03 院内アプリの共通シェル
export default async function ClinicLayout({ children, params }: LayoutProps<"/[clinic]">) {
  const { clinic: slug } = await params;
  const { clinic, member } = await requireMember(slug);
  const isOwner = member.roles.includes("owner");

  const nav: NavItem[] = (
    [
      { href: `/${slug}`, label: "予約台帳", icon: "CalendarDays", show: true },
      { href: `/${slug}/schedule`, label: "施術枠", icon: "CalendarClock", show: true },
      { href: `/${slug}/patients`, label: "患者", icon: "Users", show: true },
      { href: `/${slug}/services`, label: "メニュー", icon: "ClipboardList", show: isOwner },
      { href: `/${slug}/rooms`, label: "部屋・担当", icon: "DoorClosed", show: isOwner },
      { href: `/${slug}/questionnaires`, label: "問診テンプレ", icon: "FileText", show: isOwner },
      { href: `/${slug}/staff`, label: "スタッフ", icon: "Users", show: isOwner },
      { href: `/${slug}/settings`, label: "クリニック設定", icon: "Settings", show: isOwner },
    ] as const
  )
    .filter((item) => item.show)
    .map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <MobileNav clinicName={clinic.name} nav={nav} />
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-[var(--paper)] md:flex">
        <div className="flex h-12 items-center border-b border-[var(--line-soft)] px-4">
          <Link href={`/${slug}`} className="truncate text-sm font-semibold">
            {clinic.name}
          </Link>
        </div>
        <SidebarNav nav={nav} />
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
