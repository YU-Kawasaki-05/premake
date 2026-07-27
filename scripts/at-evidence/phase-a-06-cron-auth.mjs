// フェーズ A ⑦ 実行順 32 — AT-NTF-014: 定期実行の認可(合言葉が違えば拒否)
// 前提: CRON_SECRET を設定した状態で dev サーバが起動していること。
//   pkill -f "next dev"; CRON_SECRET=<値> pnpm dev
// 実行: AT_CRON_SECRET=<同じ値> node scripts/at-evidence/phase-a-06-cron-auth.mjs
import { BASE, DEMO_CLINIC_ID, runCase, sql, summarize } from "./lib.mjs";

const SECRET = process.env.AT_CRON_SECRET;
if (!SECRET) {
  console.error("AT_CRON_SECRET が未設定です。dev サーバに設定したのと同じ値を渡してください。");
  process.exit(1);
}
const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];

async function call(headers) {
  const res = await fetch(`${BASE}/api/cron`, { headers });
  const body = await res.text();
  return { status: res.status, body: body.slice(0, 200) };
}

verdicts.push(
  await runCase(
    {
      id: "AT-NTF-014",
      priority: "P0",
      phase: "A",
      order: 32,
      title: "定期実行の入口は合言葉なしでは呼べない",
      spec: "v2-24",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "定期実行の URL は誰でも叩ける場所にある。無防備だと第三者に大量のメール送信を誘発される。合言葉(CRON_SECRET)で保護している。",
      notes:
        "画面のない API のため、スクリーンショットではなく HTTP 応答と副作用の有無で検証している。CRON_SECRET を設定した dev サーバに対して実行。",
    },
    async (c) => {
      const before = Number(
        (sql(`select count(*) from notifications where ${C} and status = 'sent'`)[0] ?? ["0"])[0],
      );

      const noHeader = await call({});
      await c.step({
        label: "合言葉なしで呼ぶ",
        action: "認証ヘッダを付けずに GET /api/cron",
        expect: "401(拒否)。メール送信などの副作用は起きない",
        actual: `HTTP ${noHeader.status} / 応答=${noHeader.body}`,
        note: "本番相当では合言葉が必須。未設定なら入口ごと閉じる(fail-closed)設計。",
        shot: false,
        checks: [{ label: "401 で拒否される", ok: noHeader.status === 401, detail: `HTTP ${noHeader.status}` }],
      });

      const wrong = await call({ Authorization: "Bearer wrong-secret-value" });
      await c.step({
        label: "間違った合言葉で呼ぶ",
        action: "Authorization: Bearer wrong-secret-value を付けて GET /api/cron",
        expect: "401(拒否)",
        actual: `HTTP ${wrong.status} / 応答=${wrong.body}`,
        note: "比較は定数時間で行い、合言葉の長さや先頭一致から値を推測されないようにしている。",
        shot: false,
        checks: [{ label: "401 で拒否される", ok: wrong.status === 401, detail: `HTTP ${wrong.status}` }],
      });

      const mid = Number(
        (sql(`select count(*) from notifications where ${C} and status = 'sent'`)[0] ?? ["0"])[0],
      );
      c.dbCheck({
        label: "拒否された 2 回の呼び出しで副作用が起きていない",
        query: `select count(*) from notifications where ${C} and status = 'sent'`,
        expect: `送信済み件数が ${before} 件のまま`,
        actual: `${mid} 件`,
        ok: mid === before,
      });

      const ok = await call({ Authorization: `Bearer ${SECRET}` });
      await c.step({
        label: "正しい合言葉で呼ぶ",
        action: "Vercel が自動で付けるのと同じ Authorization ヘッダを付けて GET /api/cron",
        expect: "200 で正常に処理される",
        actual: `HTTP ${ok.status} / 応答=${ok.body}`,
        shot: false,
        checks: [
          { label: "200 で通る", ok: ok.status === 200, detail: `HTTP ${ok.status}` },
          { label: "処理結果が返る", ok: ok.body.includes('"ok":true'), detail: ok.body },
        ],
      });
    },
  ),
);

process.exit(summarize(verdicts) ? 0 : 1);
