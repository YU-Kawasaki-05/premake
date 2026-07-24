import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const DESCRIPTION =
  "premake を通じてクリニックのご予約をご利用いただく際の条件(暫定版)をご案内します。";

export const metadata: Metadata = {
  title: { absolute: "利用規約" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    title: "利用規約",
    description: DESCRIPTION,
  },
};

// SCR-P06 法定ページ(00_要件定義 §6 法務要件)
// 暫定版。正式版は本文確定+弁護士確認のうえ差し替える(品質監査台帳 No.26)。
// 実在の事業者名・住所・連絡先・管轄裁判所は正式公開時に記載する。

const PLACEHOLDER = "(正式公開時に記載)";

type Article = { id: string; heading: string; body: ReactNode };

const ARTICLES: Article[] = [
  {
    id: "scope",
    heading: "適用",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          本規約は、本サービスの予約ページおよび予約確認ページをご利用になるすべての方(以下「利用者」)に適用されます。
        </li>
        <li>
          診療・施術は、ご予約先のクリニック(以下「クリニック」)が提供します。本サービスは予約の受付と管理を行うソフトウェアであり、医療の提供者ではありません。
        </li>
        <li>
          クリニックが別途定める受診上のご案内や注意事項がある場合、その内容が本規約に優先して適用されることがあります。
        </li>
      </ul>
    ),
  },
  {
    id: "definitions",
    heading: "定義",
    body: (
      <dl className="divide-y divide-[var(--line-soft)] rounded-sm border border-[var(--line)] bg-[var(--surface)] px-4 text-[14px] leading-7">
        {[
          { term: "予約", desc: "本サービスを通じて申し込まれた、クリニックでの来院枠" },
          {
            term: "承認待ち",
            desc: "申込みを受け付けたものの、クリニックの承認前で確定していない状態",
          },
          { term: "予約番号", desc: "予約ごとに発行される識別番号" },
          {
            term: "キャンセル期限",
            desc: "利用者ご自身で変更・キャンセルの手続きを行える期限として、クリニックが定める時点",
          },
        ].map((row) => (
          <div key={row.term} className="py-3 sm:flex sm:gap-4">
            <dt className="font-medium text-foreground sm:w-32 sm:shrink-0">{row.term}</dt>
            <dd className="mt-0.5 sm:mt-0">{row.desc}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  {
    id: "booking",
    heading: "予約の申込みと成立",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          予約は、クリニックが申込内容を確認し承認した時点で成立します(承認制)。申込みの直後は「承認待ち」であり、来院枠は確定していません。
        </li>
        <li>
          クリニックの設定により、申込みと同時に予約が確定する運用となる場合があります。この場合は、申込みの完了をもって予約が成立します。
        </li>
        <li>
          承認および確定の結果は、ご登録のメールアドレス宛のご案内と、予約確認ページでご確認いただけます。
        </li>
        <li>
          同一の枠に複数の申込みがあった場合など、やむを得ない事情により申込みが承認されないことがあります。
        </li>
      </ul>
    ),
  },
  {
    id: "change",
    heading: "予約の変更・キャンセル",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          予約番号とご登録のメールアドレス、またはご案内メールに記載のリンクから、予約内容の確認およびキャンセルの手続きを行えます。
        </li>
        <li>
          キャンセル期限は各クリニックが定めます(既定では予約開始時刻の 24
          時間前)。期限を過ぎた後の変更・キャンセルは、クリニックへ直接ご連絡ください。
        </li>
        <li>
          キャンセル料の有無および金額は各クリニックの定めによります。詳細はクリニックのご案内をご確認ください。
        </li>
        <li>ご連絡なく来院されなかった場合、以後のご予約の受付をお断りすることがあります。</li>
      </ul>
    ),
  },
  {
    id: "notice",
    heading: "通知・連絡方法",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          ご予約に関する通知は、ご登録のメールアドレス宛に送信します。受信拒否設定や迷惑メール判定により届かない場合があるため、受信できる設定をご確認ください。
        </li>
        <li>
          ご入力いただいた連絡先に誤りがあり通知が届かなかった場合、そのことによって生じた不利益について当社およびクリニックは責任を負いかねます。
        </li>
        <li>
          本サービスからの通知が届かないときは、予約確認ページまたはクリニックへの直接のご連絡でご予約の状況をご確認ください。
        </li>
      </ul>
    ),
  },
  {
    id: "prohibited",
    heading: "禁止事項",
    body: (
      <>
        <p>利用者は、本サービスの利用にあたり次の行為を行わないものとします。</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>氏名、連絡先、問診内容について虚偽の情報を入力すること</li>
          <li>他人になりすまして申し込むこと、第三者の情報を無断で利用すること</li>
          <li>
            来院の意思がない申込み、繰り返しの無断キャンセルなど、クリニックの運営を妨げる行為
          </li>
          <li>
            本サービスまたはクリニックの設備・システムへの不正アクセス、過度な負荷をかける行為、自動化された手段による申込み
          </li>
          <li>本サービスの内容を無断で複製、改変、逆解析すること</li>
          <li>法令または公序良俗に反する行為、クリニックのスタッフや他の患者に対する迷惑行為</li>
        </ul>
        <p>
          これらに該当する行為が確認された場合、予約の取消しや本サービスのご利用の停止などの措置を取ることがあります。
        </p>
      </>
    ),
  },
  {
    id: "availability",
    heading: "サービスの提供停止・変更",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          保守作業やシステムの更新、障害、通信回線や電力の停止、災害その他のやむを得ない事由により、本サービスの提供を一時的に停止または中断することがあります。
        </li>
        <li>
          本サービスの内容は、変更、追加または終了することがあります。緊急の場合を除き、あらかじめ適切な方法でお知らせします。
        </li>
        <li>提供の停止中も、クリニックへのお電話等によるご予約・ご連絡は可能です。</li>
      </ul>
    ),
  },
  {
    id: "disclaimer",
    heading: "免責事項",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          本サービスは予約の受付と管理を行うものです。診療・施術の内容、その結果および医学的判断については、クリニックが責任を負います。
        </li>
        <li>
          利用者の通信環境や端末の不具合など、当社の管理の及ばない事由により生じた不利益について、当社は責任を負いません。
        </li>
        <li>
          当社は、本サービスが利用者の特定の目的に適合すること、および常に中断なく利用できることを保証するものではありません。
        </li>
        <li>
          当社の故意または重大な過失による場合、および法令により責任を制限できない場合には、本条の免責は適用されません。
        </li>
      </ul>
    ),
  },
  {
    id: "privacy",
    heading: "個人情報の取り扱い",
    body: (
      <>
        <p>
          利用者の個人情報は{" "}
          <Link
            href="/privacy"
            className="text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-strong)]"
          >
            プライバシーポリシー
          </Link>{" "}
          に従って取り扱います。
        </p>
        <p>
          問診票へのご回答など医療に関連する情報は、要配慮個人情報に該当し得るものとして慎重に取り扱い、施術・診療の提供および安全確認の目的の範囲を超えて利用しません。
        </p>
      </>
    ),
  },
  {
    id: "amendment",
    heading: "本規約の変更",
    body: (
      <p>
        必要と判断した場合、本規約を変更することがあります。変更後の規約は本ページに掲載した時点から適用され、掲載後にお申し込みいただいたご予約には変更後の規約が適用されます。重要な変更を行う場合は、適切な方法でお知らせします。
      </p>
    ),
  },
  {
    id: "law",
    heading: "準拠法および管轄裁判所",
    body: (
      <p>
        本規約の解釈および適用は日本法に準拠します。本サービスの利用に関して紛争が生じた場合の管轄裁判所は{" "}
        {PLACEHOLDER} とします。
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-[var(--paper)]">
      <main className="mx-auto max-w-2xl px-5 py-14 sm:py-20">
        <header>
          <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-[var(--bronze)]">
            Terms of Service
          </p>
          <h1 className="mt-3 font-serif text-[26px] font-semibold tracking-[0.04em] text-foreground sm:text-[30px]">
            利用規約
          </h1>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            制定日 {PLACEHOLDER} ・ 最終改定日 {PLACEHOLDER}
          </p>
        </header>

        <p className="mt-8 border-l-2 border-[var(--bronze)] bg-[var(--surface)] px-4 py-3 text-[13px] leading-6 text-[var(--ink-soft)]">
          本規約は正式公開前の暫定版です。事業者情報や管轄などの記載は今後確定し、条項の内容が変更される場合があります。
        </p>

        <p className="mt-8 text-[15px] leading-[1.9] text-[var(--ink-soft)] sm:text-base">
          本規約は、premake(以下「本サービス」)を通じてクリニックのご予約をご利用いただく際の条件を定めるものです。ご予約をお申し込みいただいた時点で、本規約にご同意いただいたものとして取り扱います。
        </p>

        <nav
          aria-labelledby="toc-heading"
          className="mt-10 rounded-sm border border-[var(--line)] bg-[var(--surface)] px-5 py-5"
        >
          <h2
            id="toc-heading"
            className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
          >
            目次
          </h2>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {ARTICLES.map((article, i) => (
              <li key={article.id} className="text-[13.5px] leading-6">
                <a
                  href={`#${article.id}`}
                  className="text-[var(--ink-soft)] underline-offset-4 transition-colors hover:text-[var(--primary)] hover:underline"
                >
                  <span className="mr-1.5 tabular-nums text-[var(--ink-faint)]">第{i + 1}条</span>
                  {article.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-10">
          {ARTICLES.map((article, i) => (
            <section key={article.id} id={article.id} className="scroll-mt-8">
              <h2 className="font-serif text-[17px] font-semibold leading-8 text-foreground sm:text-lg">
                <span className="mr-2 text-[15px] tabular-nums text-[var(--bronze)]">
                  第{i + 1}条
                </span>
                {article.heading}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.9] text-[var(--ink-soft)] sm:text-base">
                {article.body}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-[var(--line)] pt-6 text-[12.5px] leading-6 text-muted-foreground">
          <p>
            制定日 {PLACEHOLDER} ・ 最終改定日 {PLACEHOLDER}
          </p>
          <p className="mt-2">
            個人情報の取り扱いについては{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-[var(--primary)]"
            >
              プライバシーポリシー
            </Link>{" "}
            をご確認ください。
          </p>
        </footer>
      </main>
    </div>
  );
}
