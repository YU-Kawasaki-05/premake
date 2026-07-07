import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "新しいパスワードの設定" };

// @implements v2-01(リセットメールのリンク → auth/callback → ここ)
export default async function UpdatePasswordPage() {
  const user = await getUser();
  if (!user) redirect("/reset-password");
  return <UpdatePasswordForm />;
}
