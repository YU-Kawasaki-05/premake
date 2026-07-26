import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicClinic, getPublicServices } from "@/features/public-booking/data";
import { formatDurationMin, totalDurationMin } from "@/features/services/session-template";

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export async function generateMetadata(props: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const clinic = await getPublicClinic(slug);
  if (!clinic) return { title: { absolute: "ご予約" } };
  const description = `${clinic.name}のご予約ページ。診療メニューのご確認とご予約はこちらから。`;
  return {
    title: { absolute: `${clinic.name} | ご予約` },
    description,
    openGraph: {
      type: "website",
      title: clinic.name,
      description,
    },
  };
}

// @implements v2-19 クリニック公開ページ(医療広告: 提供主体明示・症例なしの最小構成)
export default async function PublicClinicPage(props: PageProps<"/c/[slug]">) {
  const { slug } = await props.params;
  const clinic = await getPublicClinic(slug);
  if (!clinic) notFound();
  const services = await getPublicServices(clinic.id);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="text-center">
        <h1 className="font-serif text-2xl font-semibold tracking-wide text-foreground">
          {clinic.name}
        </h1>
        {clinic.director_name && (
          <p className="mt-1 text-sm text-[var(--ink-soft)]">院長 {clinic.director_name}</p>
        )}
        {clinic.address && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {clinic.postal_code && `〒${clinic.postal_code} `}
            {clinic.address}
          </p>
        )}
        {clinic.phone && <p className="text-[13px] text-muted-foreground">TEL {clinic.phone}</p>}
      </header>

      {clinic.business_hours.length > 0 && (
        <section className="mx-auto mt-6 max-w-xs text-[13px]">
          <h2 className="text-center text-[12.5px] font-medium text-muted-foreground">診療時間</h2>
          <ul className="mt-2 space-y-0.5">
            {clinic.business_hours
              .slice()
              .sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7))
              .map((h) => (
                <li key={h.dow} className="flex justify-center gap-3 tabular-nums">
                  <span className="w-6 text-right text-muted-foreground">{DOW_LABELS[h.dow]}</span>
                  <span>
                    {h.open}–{h.close}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold">ご予約メニュー</h2>
        {services.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            現在ご予約可能なメニューがありません。
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {services.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium">{s.name}</h3>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground tabular-nums">
                      所要 {formatDurationMin(totalDurationMin(s.session_template))}
                      {s.show_price && s.price_yen != null && (
                        <> · ¥{s.price_yen.toLocaleString("ja-JP")}(自由診療)</>
                      )}
                    </p>
                    {s.description && (
                      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--ink-soft)]">
                        {s.description}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/c/${slug}/reserve?service=${s.id}`}
                    className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-[var(--primary-strong)]"
                  >
                    予約する
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-12 border-t border-[var(--line)] pt-6 text-[12px] leading-6 text-muted-foreground">
        <p>
          当ページの施術はすべて{clinic.name}(院長 {clinic.director_name ?? "—"}
          )が提供する自由診療です。
          効果には個人差があり、発赤・腫れ・かゆみ等の副作用が生じる場合があります。詳細は診察時にご説明します。
        </p>
        <p className="mt-2">
          <Link href={`/c/${slug}/lookup`} className="underline underline-offset-2">
            予約の確認・変更・キャンセルはこちら
          </Link>
        </p>
        <p className="mt-2 flex gap-3">
          <Link href="/privacy" className="underline underline-offset-2">
            プライバシーポリシー
          </Link>
          <Link href="/terms" className="underline underline-offset-2">
            利用規約
          </Link>
        </p>
      </footer>
    </main>
  );
}
