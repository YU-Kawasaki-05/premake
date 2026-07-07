"use client";

// @implements v2-01 デスクトップのサイドバーnav(現在地ハイライト)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS, type NavItem } from "./nav-icons";

export function SidebarNav({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="メイン">
      {nav.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)] aria-[current=page]:bg-[var(--primary-soft)] aria-[current=page]:font-medium aria-[current=page]:text-[var(--primary-strong)]"
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
