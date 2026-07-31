import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),
    // 差出人アドレス。本番はクリニックの認証済みドメインを設定(No.21)。未設定なら Resend 共有ドメイン。
    EMAIL_FROM_ADDRESS: z.email().optional(),
    // 予約確認メール等のリンク生成に使う自ドメイン。
    // 本番(production)では必須。未設定なら fail-fast(メールのリンクが localhost を指すのを防ぐ / NT-NEW-5)。
    // 開発では localhost:3000 を既定にする。
    APP_URL:
      process.env.NODE_ENV === "production" ? z.url() : z.url().default("http://localhost:3000"),
    // Vercel Cron の認証
    CRON_SECRET: z.string().min(1).optional(),
    // エラー監視・cron 死活監視(Sentry)。任意 — 未設定なら監視は完全に不活性(Issue #16)。
    // 本番では設定を推奨(未設定だと 500 エラーやリマインダー停止に誰も気づけない)。
    SENTRY_DSN: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    APP_URL: process.env.APP_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  emptyStringAsUndefined: true,
});
