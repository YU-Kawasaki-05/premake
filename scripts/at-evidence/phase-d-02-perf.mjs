// フェーズ D 表示速度の参考計測(本番ビルドで実行する)
// AT-NFR-001 相当。基準の合否判定には使わず、参考値として掲載する。
// 前提: pnpm build 済みで `pnpm start` が起動していること。
// 実行: node scripts/at-evidence/phase-d-02-perf.mjs
import { BASE, anonContext, closeBrowser, login, runCase, sqlOne, summarize } from "./lib.mjs";

const verdicts = [];

/** ページを開いて LCP と応答時間を測る */
async function measure(page, url, times = 3) {
  const samples = [];
  for (let i = 0; i < times; i++) {
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "load" });
    const elapsed = Date.now() - t0;
    const lcp = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let value = 0;
          try {
            const po = new PerformanceObserver((list) => {
              for (const e of list.getEntries()) value = e.startTime;
            });
            po.observe({ type: "largest-contentful-paint", buffered: true });
          } catch {
            /* 未対応 */
          }
          setTimeout(() => resolve(Math.round(value)), 900);
        }),
    );
    samples.push({ elapsed, lcp });
  }
  const avg = (k) => Math.round(samples.reduce((s, x) => s + x[k], 0) / samples.length);
  const max = (k) => Math.max(...samples.map((x) => x[k]));
  return { samples, avgElapsed: avg("elapsed"), maxElapsed: max("elapsed"), avgLcp: avg("lcp") };
}

verdicts.push(
  await runCase(
    {
      id: "AT-NFR-001",
      priority: "P1",
      phase: "D",
      order: 310,
      title: "【参考値】表示速度の実測(本番ビルド・手元の PC)",
      spec: "非機能",
      refs: ["20_受け入れテスト/07_非機能・セキュリティ.md"],
      intent:
        "台帳が重いと現場が使わなくなる。公開ページが遅いと患者が離脱する。ただし本番の速度はサーバーの場所と回線に大きく左右される。",
      notes:
        "手元の PC で本番ビルドを動かした参考値。実際の速度は本番インフラ(Vercel + Supabase Tokyo)で改めて計測する必要があるため、基準の合否判定には使わない。",
    },
    async (c) => {
      c.partial(
        "本番インフラ上の実測ではないため、基準(台帳 p95 < 500ms / 公開ページ LCP < 2.5s)の達成判定には使えません。ここでは参考値として記録します。",
      );

      const { ctx: anonCtx, page: anon } = await anonContext();
      const pub = await measure(anon, `${BASE}/c/demo`);
      await c.step({
        label: "公開ページ(患者が最初に見る画面)",
        action: "本番ビルドで /c/demo を 3 回読み込み、表示完了までの時間を測る",
        expect: "(参考)LCP が 2.5 秒を大きく超えないこと",
        actual: `読み込み 平均 ${pub.avgElapsed}ms / 最大 ${pub.maxElapsed}ms / LCP 平均 ${pub.avgLcp}ms`,
        note: "手元の PC で計測した値。本番はサーバーとの距離・回線が加わる。",
        page: anon,
        fullPage: false,
        checks: [{ label: "(参考)計測できた", ok: pub.avgElapsed > 0, detail: `${pub.avgElapsed}ms` }],
      });
      await anonCtx.close();

      const { ctx, page } = await login("nurse1@demo.local");
      const ledger = await measure(page, `${BASE}/demo`);
      const bookings = sqlOne("select count(*) from bookings");
      await c.step({
        label: "予約台帳(受付が一日中開く画面)",
        action: "本番ビルドで /demo を 3 回読み込み、表示完了までの時間を測る",
        expect: "(参考)体感で待たされないこと",
        actual: `読み込み 平均 ${ledger.avgElapsed}ms / 最大 ${ledger.maxElapsed}ms(予約データ ${bookings} 件)`,
        note: "データ量が増えると遅くなるため、本番では実データ量での再計測が必要。",
        page,
        fullPage: false,
        checks: [{ label: "(参考)計測できた", ok: ledger.avgElapsed > 0, detail: `${ledger.avgElapsed}ms` }],
      });
      await ctx.close();

      c.dbCheck({
        label: "計測条件",
        query: "pnpm build && pnpm start(本番ビルド)/ ローカル Supabase / 手元の PC",
        expect: "本番インフラでの再計測が必要",
        actual: `公開ページ ${pub.avgElapsed}ms(LCP ${pub.avgLcp}ms) / 台帳 ${ledger.avgElapsed}ms / 予約 ${bookings} 件`,
        ok: true,
      });
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
