import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { requireOps } from "@/lib/auth";

// @implements v2-25
export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  await requireOps();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center justify-between border-b border-border bg-card px-5">
        <div className="flex items-center gap-3">
          <Link href="/ops" className="font-serif text-base font-semibold tracking-wide">
            premake
          </Link>
          <span className="rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--primary-strong)]">
            運営
          </span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ログアウト
          </button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
