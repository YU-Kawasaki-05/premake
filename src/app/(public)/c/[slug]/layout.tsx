// 患者向け公開ページの共通レイアウト(モバイルファースト・上品なクリニックサイト調)
export default function PublicClinicLayout({ children }: LayoutProps<"/c/[slug]">) {
  return <div className="min-h-dvh bg-[var(--paper)]">{children}</div>;
}
