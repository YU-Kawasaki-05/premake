import type { Metadata } from "next";
import { ResetRequestForm } from "@/features/auth/components/reset-request-form";

export const metadata: Metadata = { title: "パスワード再設定" };

// @implements v2-01
export default function ResetPasswordPage() {
  return <ResetRequestForm />;
}
