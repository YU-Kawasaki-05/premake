import "server-only";

import { Resend } from "resend";
import { env } from "@/env";

const FROM = "premake <onboarding@resend.dev>"; // TODO: 本番はクリニックの認証済みドメインに

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
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
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
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
