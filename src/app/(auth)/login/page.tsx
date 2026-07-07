import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "ログイン" };

// @implements v2-01
export default function LoginPage() {
  return <LoginForm />;
}
