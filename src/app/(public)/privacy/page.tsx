import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const DESCRIPTION =
  "premake が予約・問診を通じて取得する個人情報の取り扱い方針(暫定版)をご案内します。";

export const metadata: Metadata = {
  title: { absolute: "プライバシーポリシー" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    title: "プライバシーポリシー",
    description: DESCRIPTION,
  },
};

// SCR-P06 法定ページ(00_要件定義 §6 法務要件)
// 暫定版。正式版は本文確定+弁護士確認のうえ差し替える(品質監査台帳 No.26)。
// 実在の事業者名・住所・連絡先は正式公開時に記載する。

const PLACEHOLDER = "(正式公開時に記載)";

type Section = { id: string; heading: string; body: ReactNode };

const SECTIONS: Section[] = [
  {
    id: "about",
    heading: "本ポリシーについて",
    body: (
      <>
        <p>
          本ポリシーは、本サービスの公開予約ページ、予約確認ページ、およびクリニックの院内管理画面を通じて取得する個人情報の取り扱いを対象とします。
        </p>
        <p>
          本サービスの運営者(以下「当社」)は {PLACEHOLDER} です。
          クリニックが独自にプライバシーポリシーを定めている場合、患者情報の取り扱いについては当該クリニックの定めが優先して適用されることがあります。
        </p>
      </>
    ),
  },
  {
    id: "collect",
    heading: "取得する情報",
    body: (
      <>
        <p>本サービスでは、ご予約および院内業務の運用のために次の情報を取得します。</p>
        <dl className="mt-1 divide-y divide-[var(--line-soft)] rounded-sm border border-[var(--line)] bg-[var(--surface)] px-4 text-[14px] leading-7">
          {[
            { term: "ご本人に関する情報", desc: "氏名、氏名のかな、生年月日(取得する場合)" },
            { term: "連絡先", desc: "電話番号、メールアドレス" },
            {
              term: "予約に関する情報",
              desc: "予約番号、ご希望のメニュー、予約日時、来院状況、変更・キャンセルの履歴、備考",
            },
            {
              term: "医療に関連する情報",
              desc: "問診票へのご回答(既往歴・服薬・アレルギー・ご希望内容など)、クリニックが記録する経過のメモ。クリニックが本サービスの問診機能を利用する場合に限り取得します。",
            },
            {
              term: "技術的な情報",
              desc: "Cookie、アクセスログ(IP アドレス、ブラウザの種類、アクセス日時)、操作の記録",
            },
          ].map((row) => (
            <div key={row.term} className="py-3 sm:flex sm:gap-4">
              <dt className="font-medium text-foreground sm:w-44 sm:shrink-0">{row.term}</dt>
              <dd className="mt-0.5 sm:mt-0">{row.desc}</dd>
            </div>
          ))}
        </dl>
      </>
    ),
  },
  {
    id: "sensitive",
    heading: "医療に関連する情報(要配慮個人情報)の取り扱い",
    body: (
      <>
        <p>
          問診票へのご回答など、健康状態や受診の履歴に関する情報は、個人情報保護法上の要配慮個人情報に該当し得るものとして、特に慎重に取り扱います。
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>取得はご本人の同意に基づいて行います。</li>
          <li>
            施術・診療の安全な提供と事前確認の目的に限って利用し、広告・宣伝その他の目的外利用は行いません。
          </li>
          <li>閲覧できる者を、業務上必要な範囲の院内スタッフに限定します。</li>
          <li>閲覧および変更の記録を保存し、後から確認できるようにしています。</li>
        </ul>
      </>
    ),
  },
  {
    id: "purpose",
    heading: "利用目的",
    body: (
      <>
        <p>取得した情報は、次の目的の範囲内で利用します。</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>ご予約の受付、確認、変更、キャンセルの管理</li>
          <li>ご予約内容および来院に関するご案内の送信</li>
          <li>施術・診療を安全に提供するための事前確認</li>
          <li>院内業務(担当スタッフ・部屋・機器の割り当て)の運用</li>
          <li>お問い合わせへの対応</li>
          <li>不正な利用や繰り返しの無断キャンセルの防止</li>
          <li>個人を識別できない形に集計した統計情報によるサービスの改善</li>
        </ul>
        <p>上記の範囲を超えて利用する場合は、あらかじめご本人の同意を得ます。</p>
      </>
    ),
  },
  {
    id: "third-party",
    heading: "第三者への提供",
    body: (
      <>
        <p>
          取得した情報を、ご本人の同意なく第三者へ提供することはありません。ただし、次の場合を除きます。
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>法令に基づく場合、または裁判所・行政機関等から適法に開示を求められた場合</li>
          <li>人の生命、身体または財産の保護のために必要で、ご本人の同意を得ることが困難な場合</li>
          <li>事業の承継に伴って提供する場合(承継後も本ポリシーの利用目的の範囲内で扱います)</li>
        </ul>
        <p>次条の業務委託に伴う取り扱いは、第三者提供には該当しません。</p>
      </>
    ),
  },
  {
    id: "outsourcing",
    heading: "業務の委託",
    body: (
      <>
        <p>
          利用目的の達成に必要な範囲で、次の業務を外部の事業者に委託することがあります。委託先の名称は{" "}
          {PLACEHOLDER} します。
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>サーバー・データベースの提供(クラウドホスティング)</li>
          <li>ご予約に関するメールの配信</li>
          <li>障害の監視およびエラー記録の収集</li>
        </ul>
        <p>
          委託先は必要な安全管理措置を講じている事業者を選定し、契約により守秘義務と目的外利用の禁止を課したうえで、その取り扱いを監督します。
        </p>
      </>
    ),
  },
  {
    id: "security",
    heading: "安全管理措置",
    body: (
      <>
        <p>情報の漏えい、滅失または毀損を防ぐため、次の措置を講じています。</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>通信の暗号化(TLS)</li>
          <li>役割に応じたアクセス制御と、クリニック単位でのデータの分離</li>
          <li>患者情報・問診の閲覧および変更の記録(監査ログ)の保存</li>
          <li>取り扱う担当者の限定と、取り扱い方法の周知</li>
        </ul>
        <p>
          これらの措置は継続的に見直しますが、技術的・運用上の限界があるため、安全性を完全に保証するものではありません。
        </p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "保存期間と廃棄",
    body: (
      <>
        <p>
          ご予約および患者に関する情報は、クリニックにおける記録の保存に関する定めおよび関係法令に従って保存します。監査ログは、不正利用の調査および説明責任の履行のために一定期間保存します。
        </p>
        <p>
          利用目的を達成し、保存の必要がなくなった情報は、適切な方法で削除または廃棄します。具体的な保存期間は{" "}
          {PLACEHOLDER} します。
        </p>
      </>
    ),
  },
  {
    id: "cookie",
    heading: "Cookie とアクセスログ",
    body: (
      <>
        <p>
          ログイン状態の維持、不正アクセスの防止、不具合の調査のために Cookie
          およびアクセスログを利用します。広告配信を目的とした第三者による行動追跡は行っていません。
        </p>
        <p>
          ブラウザの設定で Cookie
          を無効にした場合、ご予約の確認など一部の機能がご利用いただけないことがあります。
        </p>
      </>
    ),
  },
  {
    id: "rights",
    heading: "開示・訂正・利用停止等のご請求",
    body: (
      <>
        <p>
          ご自身に関する情報について、開示、訂正、追加、削除、利用の停止、第三者提供の停止をご請求いただけます。ご本人であることを確認できる方法で受け付け、法令に定めがある場合を除き対応します。
        </p>
        <p>
          ご予約や問診の内容に関するご請求は、まずご利用のクリニックの受付窓口へご連絡ください。本サービスの運営者への窓口は{" "}
          {PLACEHOLDER} します。
        </p>
      </>
    ),
  },
  {
    id: "revision",
    heading: "本ポリシーの改定",
    body: (
      <p>
        法令の改正やサービス内容の変更に応じて、本ポリシーを改定することがあります。重要な変更を行う場合は、本ページへの掲載その他の適切な方法でお知らせします。改定後の内容は、本ページに掲載した時点から適用されます。
      </p>
    ),
  },
  {
    id: "contact",
    heading: "お問い合わせ",
    body: (
      <>
        <p>本ポリシーおよび個人情報の取り扱いに関するお問い合わせ窓口は {PLACEHOLDER} します。</p>
        <p>
          ご予約の内容、変更、キャンセルに関するお問い合わせは、ご予約先のクリニックへ直接ご連絡ください。
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[var(--paper)]">
      <main className="mx-auto max-w-2xl px-5 py-14 sm:py-20">
        <header>
          <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-[var(--bronze)]">
            Privacy Policy
          </p>
          <h1 className="mt-3 font-serif text-[26px] font-semibold tracking-[0.04em] text-foreground sm:text-[30px]">
            プライバシーポリシー
          </h1>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            制定日 {PLACEHOLDER} ・ 最終改定日 {PLACEHOLDER}
          </p>
        </header>

        <p className="mt-8 border-l-2 border-[var(--bronze)] bg-[var(--surface)] px-4 py-3 text-[13px] leading-6 text-[var(--ink-soft)]">
          本ポリシーは正式公開前の暫定版です。事業者情報・委託先・お問い合わせ窓口などの記載は今後確定し、内容が変更される場合があります。
        </p>

        <p className="mt-8 text-[15px] leading-[1.9] text-[var(--ink-soft)] sm:text-base">
          premake(以下「本サービス」)は、クリニックのご予約受付と院内業務の管理を行うためのソフトウェアです。診療・施術の提供および患者情報の管理主体は、ご予約先の各クリニック(以下「クリニック」)であり、本サービスの運営者はクリニックからの委託に基づいて情報を取り扱います。
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
            {SECTIONS.map((section, i) => (
              <li key={section.id} className="text-[13.5px] leading-6">
                <a
                  href={`#${section.id}`}
                  className="text-[var(--ink-soft)] underline-offset-4 transition-colors hover:text-[var(--primary)] hover:underline"
                >
                  <span className="mr-1.5 tabular-nums text-[var(--ink-faint)]">{i + 1}</span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-10">
          {SECTIONS.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-8">
              <h2 className="font-serif text-[17px] font-semibold leading-8 text-foreground sm:text-lg">
                <span className="mr-2 text-[15px] tabular-nums text-[var(--bronze)]">{i + 1}.</span>
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.9] text-[var(--ink-soft)] sm:text-base">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-[var(--line)] pt-6 text-[12.5px] leading-6 text-muted-foreground">
          <p>
            制定日 {PLACEHOLDER} ・ 最終改定日 {PLACEHOLDER}
          </p>
          <p className="mt-2">
            ご予約時の条件については{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2 hover:text-[var(--primary)]"
            >
              利用規約
            </Link>{" "}
            をご確認ください。
          </p>
        </footer>
      </main>
    </div>
  );
}
