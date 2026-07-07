import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-[var(--paper)] px-6">
      <h1 className="font-serif text-3xl font-semibold tracking-wide text-foreground">premake</h1>
      <p className="max-w-md text-center text-sm leading-7 text-muted-foreground">
        クリニックの自由診療予約・業務管理システム
      </p>
      <Link
        href="/login"
        className="inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--primary-strong)]"
      >
        スタッフログイン
      </Link>
    </main>
  );
}
