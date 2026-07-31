import "server-only";

import { env } from "@/env";

/**
 * サーバーエラー監視と cron の死活監視(Issue #16)。
 *
 * SENTRY_DSN が未設定なら全 API が即 return する完全な no-op で、`@sentry/node` の
 * 読み込みすら行わない(本番で環境変数を足した瞬間に有効化される)。
 *
 * `@sentry/nextjs` は使わない。next.config へのパッチ・バンドラ連携を伴い、
 * この Next フォークとの互換が未検証のため、`@sentry/node` を instrumentation.ts の
 * register() から手動で初期化する。
 */

type SentryNode = typeof import("@sentry/node");

/** Sentry Crons のモニター slug(Sentry 側での事前作成は不要。初回チェックインで自動作成される) */
const REMINDER_CRON_MONITOR_SLUG = "reminder-cron";
/** vercel.json の crons と一致させる。ズレると Sentry が遅延を誤検知する。Vercel Cron は UTC 実行 */
const REMINDER_CRON_SCHEDULE = "0 * * * *";
/** サーバーレスではレスポンス後にプロセスが凍結されうるため、送信完了を待つ上限 */
const FLUSH_TIMEOUT_MS = 2000;

let sentryPromise: Promise<SentryNode | null> | null = null;

/**
 * 初期化済みの Sentry を返す。DSN 未設定なら null(`@sentry/node` を読み込まない)。
 * 監視の失敗でアプリを止めないため、読み込み・初期化の失敗は null に潰す。
 */
async function getSentry(): Promise<SentryNode | null> {
  const dsn = env.SENTRY_DSN;
  if (!dsn) return null;
  if (!sentryPromise) {
    sentryPromise = import("@sentry/node")
      .then((Sentry) => {
        if (!Sentry.isInitialized()) {
          Sentry.init({
            dsn,
            environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
            release: process.env.VERCEL_GIT_COMMIT_SHA,
            // 目的はエラーと cron の死活監視のみ。トレースは送らない(無料枠の消費と負荷を避ける)
            tracesSampleRate: 0,
            // 患者情報の外部送信を避ける: IP・Cookie・リクエストボディを自動収集させない
            sendDefaultPii: false,
            // console 出力をパンくずに載せない。Postgres のエラー詳細には
            // 「Key (email)=(...) already exists」のように患者の値が入りうる
            integrations: (defaults) => defaults.filter((i) => i.name !== "Console"),
          });
        }
        return Sentry;
      })
      .catch((error) => {
        console.error("[monitoring] failed to initialize Sentry", error);
        return null;
      });
  }
  return sentryPromise;
}

/** サーバー起動時に一度だけ呼ぶ(instrumentation.ts の register) */
export async function initMonitoring(): Promise<void> {
  await getSentry();
}

type RequestErrorRequest = { method: string };
type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
};

/**
 * instrumentation.ts の onRequestError から呼ぶ。
 *
 * 具体的なリクエスト URL とヘッダは**送らない**。`/c/[slug]/manage/[token]` のように
 * パスに予約管理トークンが載る導線があり、Cookie/Authorization も同様に秘密のため。
 * 代わりにルートのファイルパス(動的セグメントは `[token]` のまま)だけを送る。
 */
export async function reportRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    scope.setTransactionName(context.routePath);
    scope.setContext("nextjs", {
      request_method: request.method,
      router_kind: context.routerKind,
      route_path: context.routePath,
      route_type: context.routeType,
    });
    Sentry.captureException(error, { mechanism: { type: "instrumentation", handled: false } });
  });
  await Sentry.flush(FLUSH_TIMEOUT_MS);
}

/** 実行中のチェックイン。監視無効時は null */
export type CronCheckIn = { checkInId: string; startedAtMs: number } | null;

/**
 * リマインダー cron の開始を Sentry Crons に通知する。
 * 期待時刻に in_progress が届かなければ Sentry 側が「missed」として検知する
 * = cron が止まったこと自体に気づける(アプリからは通知できない事象)。
 */
export async function startReminderCronCheckIn(): Promise<CronCheckIn> {
  const Sentry = await getSentry();
  if (!Sentry) return null;
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: REMINDER_CRON_MONITOR_SLUG, status: "in_progress" },
    {
      schedule: { type: "crontab", value: REMINDER_CRON_SCHEDULE },
      timezone: "Etc/UTC",
      // 1 時間ごとの実行。10 分の遅れは許容し、10 分を超える実行はタイムアウト扱い
      checkinMargin: 10,
      maxRuntime: 10,
      // 2 回連続(= 約 2 時間)止まったら通知。単発のブレでは鳴らさない
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
    },
  );
  return { checkInId, startedAtMs: Date.now() };
}

/** リマインダー cron の終了を Sentry Crons に通知する */
export async function finishReminderCronCheckIn(
  checkIn: CronCheckIn,
  status: "ok" | "error",
): Promise<void> {
  if (!checkIn) return;
  const Sentry = await getSentry();
  if (!Sentry) return;
  Sentry.captureCheckIn({
    monitorSlug: REMINDER_CRON_MONITOR_SLUG,
    status,
    checkInId: checkIn.checkInId,
    duration: (Date.now() - checkIn.startedAtMs) / 1000,
  });
  await Sentry.flush(FLUSH_TIMEOUT_MS);
}
