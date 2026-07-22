import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LookupForm } from "@/features/public-booking/components/lookup-form";
import { getPublicClinic } from "@/features/public-booking/data";

export async function generateMetadata(props: PageProps<"/c/[slug]/lookup">): Promise<Metadata> {
  const { slug } = await props.params;
  const clinic = await getPublicClinic(slug);
  return { title: { absolute: clinic ? `予約の確認 | ${clinic.name}` : "予約の確認" } };
}

// @implements v2-21 予約照会(番号 + メール)
export default async function LookupPage(props: PageProps<"/c/[slug]/lookup">) {
  const { slug } = await props.params;
  const clinic = await getPublicClinic(slug);
  if (!clinic) notFound();

  return (
    <main className="mx-auto max-w-sm px-5 py-12">
      <h1 className="font-serif text-xl font-semibold">予約の確認・キャンセル</h1>
      <p className="mt-2 text-[13px] leading-6 text-[var(--ink-soft)]">
        予約時の予約番号とメールアドレスを入力してください。
      </p>
      <LookupForm slug={slug} />
    </main>
  );
}
