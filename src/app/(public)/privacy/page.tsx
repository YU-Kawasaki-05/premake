import type { Metadata } from "next";

export const metadata: Metadata = { title: "プライバシーポリシー" };

// 最小の法定ページ(β)。正式版は弁護士確認のうえ差し替える。
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-sm leading-7 text-[var(--ink-soft)]">
      <h1 className="font-serif text-xl font-semibold text-foreground">プライバシーポリシー</h1>
      <p className="mt-4">
        premake(以下「本サービス」)は、クリニックの予約・業務管理を支援するソフトウェアです。
        本サービスは、予約・問診等の個人情報を、各クリニック(医療提供主体)の管理のもとで
        取り扱います。
      </p>
      <h2 className="mt-6 font-semibold text-foreground">取得する情報</h2>
      <p className="mt-2">
        氏名・連絡先・予約内容・問診回答等。これらは予約管理および施術の提供のために利用します。
      </p>
      <h2 className="mt-6 font-semibold text-foreground">第三者提供</h2>
      <p className="mt-2">法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。</p>
      <h2 className="mt-6 font-semibold text-foreground">お問い合わせ</h2>
      <p className="mt-2">
        個人情報の開示・訂正・削除のご請求は、ご利用のクリニックへご連絡ください。
      </p>
      <p className="mt-8 text-[12px]">※ 本ページはβ版の暫定内容です。</p>
    </main>
  );
}
