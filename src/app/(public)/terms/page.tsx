import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "利用規約" } };

// 最小の法定ページ(β)。正式版は弁護士確認のうえ差し替える。
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-sm leading-7 text-[var(--ink-soft)]">
      <h1 className="font-serif text-xl font-semibold text-foreground">利用規約</h1>
      <p className="mt-4">
        本サービスは、予約の申込・確認・変更・キャンセルを行うための機能を提供します。
        施術・診療・医学的判断は、予約先のクリニック(医療提供主体)および医師・看護師が行います。
      </p>
      <h2 className="mt-6 font-semibold text-foreground">予約とキャンセル</h2>
      <p className="mt-2">
        予約の確定・変更・キャンセルの可否および期限は、各クリニックの定めによります。
        キャンセル期限を過ぎた場合は、クリニックへ直接ご連絡ください。
      </p>
      <h2 className="mt-6 font-semibold text-foreground">免責</h2>
      <p className="mt-2">
        本サービスは予約・業務管理の支援ソフトウェアであり、医療の提供者ではありません。
      </p>
      <p className="mt-8 text-[12px]">※ 本ページはβ版の暫定内容です。</p>
    </main>
  );
}
