// 認証系画面の共通レイアウト(中央寄せカード)@implements v2-01
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--paper)] px-6 py-12">
      <p className="mb-8 font-serif text-2xl font-semibold tracking-wide text-foreground">
        premake
      </p>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
