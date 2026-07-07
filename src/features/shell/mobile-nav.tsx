"use client";

// @implements v2-01 モバイル用ナビ(md 未満・タブレット/スマホ)

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { logout } from "@/features/auth/actions";
import { NAV_ICONS, type NavItem } from "./nav-icons";

export function MobileNav({ clinicName, nav }: { clinicName: string; nav: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="メニューを開く">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b border-[var(--line-soft)]">
            <SheetTitle className="truncate text-sm">{clinicName}</SheetTitle>
          </SheetHeader>
          <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="メイン">
            {nav.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)] aria-[current=page]:bg-[var(--primary-soft)] aria-[current=page]:font-medium aria-[current=page]:text-[var(--primary-strong)]"
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-[var(--line-soft)] px-4 py-3">
            <form action={logout}>
              <button
                type="submit"
                className="text-[12.5px] text-muted-foreground underline-offset-4 hover:underline"
              >
                ログアウト
              </button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
      <span className="truncate text-sm font-semibold">{clinicName}</span>
    </header>
  );
}
