import type { Instrumentation } from "next";

/**
 * サーバー側の可観測性の入口(Issue #16)。
 *
 * `@sentry/node` は Node ランタイム専用のため `NEXT_RUNTIME` で明示的に絞り、
 * import も分岐の内側に置いて edge バンドルへ持ち込まない。
 * SENTRY_DSN 未設定時は @/lib/monitoring 側で即 return する(挙動変化なし)。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initMonitoring } = await import("@/lib/monitoring");
  await initMonitoring();
}

/** Server Components / Route Handler / Server Action / proxy で捕捉された例外を受け取る */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("@/lib/monitoring");
  await reportRequestError(error, request, context);
};
