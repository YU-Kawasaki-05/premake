import "server-only";

import { Resend } from "resend";
import { env } from "@/env";

// アドレス部は env(EMAIL_FROM_ADDRESS)で上書き可。未設定なら Resend 共有テストドメイン。
// 本番はクリニックの認証済みドメイン(SPF/DKIM)を EMAIL_FROM_ADDRESS に設定する(No.21)。
const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";

// 差出人表示名(クリニック名)にヘッダを壊す文字が混ざらないよう除去する。
function sanitizeFromName(name: string): string {
  return name.replace(/[\r\n"<>]/g, "").trim();
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** 差出人表示名。省略時は "premake"(No.21: 通常はクリニック名を渡す) */
  fromName?: string;
};

/**
 * メール送信。RESEND_API_KEY 未設定(開発)ではログ出力のみで成功扱い。
 * @returns 送信できたか
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) {
    console.info("[email:dev] would send", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: true };
  }
  try {
    const address = env.EMAIL_FROM_ADDRESS ?? DEFAULT_FROM_ADDRESS;
    const displayName = (input.fromName ? sanitizeFromName(input.fromName) : "") || "premake";
    const from = `"${displayName}" <${address}>`;
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
