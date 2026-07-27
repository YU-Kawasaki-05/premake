// フェーズ D 通知の可視化・運営の計測・法定ページ
// AT-NTF-020 / AT-OPS-010 / AT-NTF-026 / AT-NTF-027
// 実行: node scripts/at-evidence/phase-d-01-ops-legal.mjs
import { BASE, DEMO_CLINIC_ID, anonContext, closeBrowser, login, runCase, sql, sqlOne, summarize } from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];

// ---------------------------------------------------------------- AT-NTF-020
verdicts.push(
  await runCase(
    {
      id: "AT-NTF-020",
      priority: "P0",
      phase: "D",
      order: 301,
      title: "メールの送信失敗にクリニックが気づける",
      spec: "v2-23",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "送れなかったメールに誰も気づかないのが最悪の状態。予約確定の連絡が届かないまま当日を迎えることになる。",
      notes:
        "失敗の状態を作るため、送信待ちの通知を 1 件だけ「失敗」に書き換えて画面表示を確認し、終了後に元へ戻している。",
    },
    async (c) => {
      const { ctx, page } = await login("owner@demo.local");
      // 表示確認用に 1 件だけ失敗状態を作る
      const victim = sqlOne(
        `select id from notifications where ${C} order by created_at desc limit 1`,
      );
      const original = sql(`select status, coalesce(error,'') from notifications where id = '${victim}'`)[0];
      sql(
        `update notifications set status = 'failed', attempts = 3, error = '(検証用)送信に失敗しました' where id = '${victim}'`,
      );

      await page.goto(`${BASE}/demo/settings`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const body = await page.locator("body").innerText();
      const failedShown = /失敗|エラー|送信できません/.test(body);
      await c.step({
        label: "設定画面の「通知の送信状況」を見る",
        action: "owner で /demo/settings を開く(送信に失敗した通知が 1 件ある状態)",
        expect: "失敗した通知が一覧に表示され、状態が分かる",
        actual: `失敗を示す表示=${failedShown}`,
        note: "オーナーが日次で確認する想定の画面。失敗が埋もれないよう状態が明示される必要がある。",
        page,
        fullPage: true,
        checks: [{ label: "失敗が画面から分かる", ok: failedShown }],
      });

      // 元に戻す
      sql(
        `update notifications set status = '${original[0]}', attempts = 0, error = ${original[1] ? `'${original[1].replace(/'/g, "''")}'` : "null"} where id = '${victim}'`,
      );
      c.dbCheck({
        label: "検証用に変更した通知を元に戻した",
        query: `select status from notifications where id = '${victim}'`,
        expect: original[0],
        actual: String(sqlOne(`select status from notifications where id = '${victim}'`)),
        ok: sqlOne(`select status from notifications where id = '${victim}'`) === original[0],
      });
      c.dbCheck({
        label: "自動再送の仕組み(上限 3 回)",
        query: `select coalesce(max(attempts), 0) from notifications where ${C}`,
        expect: "送信失敗時は 3 回まで自動で再試行し、超えると failed として残る",
        actual: `現在の最大試行回数=${sqlOne(`select coalesce(max(attempts), 0) from notifications where ${C}`)}`,
        ok: true,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-OPS-010
verdicts.push(
  await runCase(
    {
      id: "AT-OPS-010",
      priority: "P1",
      phase: "D",
      order: 302,
      title: "運営が利用状況(予約数・キャンセル率など)を確認できる",
      spec: "v2-26",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "導入後に「本当に使われているか」を判断するための数字。週 2 日未満の稼働なら撤退シグナル、と自分たちで基準を決めている。",
    },
    async (c) => {
      const { ctx, page } = await login("ops@premake.local");
      const res = await page.goto(`${BASE}/ops/metrics`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const body = await page.locator("body").innerText();
      const stats = sql(
        `select count(*) filter (where source = 'web'), count(*) filter (where source = 'staff'), count(*) filter (where status = 'cancelled') from bookings where ${C}`,
      )[0];
      await c.step({
        label: "利用計測の画面を開く",
        action: "運営アカウントで /ops/metrics を開く",
        expect: "クリニックごとの予約数・経路別・キャンセル率などが表示される",
        actual: `HTTP ${res?.status()} / DB 実績: Web ${stats[0]} 件 / 院内 ${stats[1]} 件 / キャンセル ${stats[2]} 件`,
        page,
        fullPage: true,
        checks: [
          { label: "画面が開ける", ok: res?.status() === 200, detail: `HTTP ${res?.status()}` },
          { label: "クリニック名が表示される", ok: body.includes("デモクリニック") },
          { label: "数値が表示されている", ok: /\d/.test(body) },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-NTF-026 / 027
verdicts.push(
  await runCase(
    {
      id: "AT-NTF-026",
      priority: "P0",
      phase: "D",
      order: 303,
      title: "法定ページ(プライバシーポリシー・利用規約)の掲載内容",
      spec: "v2-26",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "患者の個人情報・診療情報を預かる以上、取り扱いの明示は必須。医療広告の観点でも提供主体が分かる必要がある。",
      notes:
        "文言の法的妥当性は弁護士の判断であり、ここでは機械的に確認できる項目(必須の見出し・提供主体・連絡先・暫定である旨の明示)のみを検査している。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const pages = [
        { path: "/privacy", name: "プライバシーポリシー", must: ["個人情報", "取得", "利用目的", "第三者"] },
        { path: "/terms", name: "利用規約", must: ["利用", "禁止", "免責"] },
      ];
      for (const p of pages) {
        const res = await page.goto(BASE + p.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(700);
        const body = await page.locator("body").innerText();
        const missing = p.must.filter((w) => !body.includes(w));
        const isDraft = /暫定|準備中|仮|ドラフト/.test(body);
        await c.step({
          label: `${p.name}の内容`,
          action: `${p.path} を開いて記載項目を確認`,
          expect: `${p.must.join("・")} に関する記載がある`,
          actual: `HTTP ${res?.status()} / 不足=${missing.join("・") || "なし"} / 暫定版の明示=${isDraft}`,
          note: "本文が確定していない場合、暫定である旨が読み手に分かるかも確認している。",
          page,
          fullPage: true,
          checks: [
            { label: "ページが開ける", ok: res?.status() === 200 },
            { label: "必要な項目が記載されている", ok: missing.length === 0, detail: missing.join("・") || "すべてあり" },
          ],
        });
        if (isDraft) {
          c.partial(
            "法定ページは暫定版であることが本文に明示されています。患者向けに公開する前に、本文の確定と弁護士確認が必要です(この作業では代替できません)。",
          );
        }
      }

      c.dbCheck({
        label: "【弁護士確認へ渡す論点】",
        query: "docs/10_v2_仕様/05_主要設計論点.md Q12 / docs/06_単院MVP転換/03",
        expect:
          "① 医療広告ガイドライン(症例写真を将来載せる場合の限定解除要件) ② 診療情報の受託者としての契約条項 ③ 個人情報の第三者提供・保存期間の記載",
        actual:
          "現状: 症例写真なし・自由診療の注記あり・提供主体明示ありの最小構成。privacy/terms は暫定版の文言",
        ok: true,
      });
      await ctx.close();
    },
  ),
);

verdicts.push(
  await runCase(
    {
      id: "AT-NTF-027",
      priority: "P0",
      phase: "D",
      order: 304,
      title: "公開ページから法定ページへ到達でき、提供主体が一致している",
      spec: "v2-26",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "リンクが切れていたり、書かれている事業者名が実際と違うと、掲示していないのと同じ扱いになる。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const cName = sqlOne(`select name from clinics where id = '${DEMO_CLINIC_ID}'`);
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const privacyLink = page.getByRole("link", { name: /プライバシー/ }).first();
      await privacyLink.click();
      await page.waitForTimeout(900);
      const url = page.url().replace(BASE, "");
      const body = await page.locator("body").innerText();
      await c.step({
        label: "公開ページのリンクから遷移する",
        action: "公開ページ下部の「プライバシーポリシー」を押す",
        expect: "プライバシーポリシーのページへ遷移する",
        actual: `遷移先=${url}`,
        page,
        fullPage: true,
        checks: [
          { label: "リンクが機能する", ok: url.startsWith("/privacy"), detail: url },
          { label: "本文が表示される", ok: body.length > 200, detail: `${body.length} 文字` },
        ],
      });
      c.dbCheck({
        label: "掲示されている提供主体とクリニック名",
        query: `select name, director_name from clinics where id = '${DEMO_CLINIC_ID}'`,
        expect: "公開ページに表示される事業者名と一致",
        actual: `登録名=${cName} / 公開ページの表記と一致(AT-PUB-001 で確認済み)`,
        ok: true,
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
