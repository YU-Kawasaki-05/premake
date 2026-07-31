// リリースゲート「P0 全数合格」に対する現在地を算出し、報告書用の JSON を出す。
// 実行: node scripts/at-evidence/p0-coverage.mjs
// 出力: docs/21_手動受入テスト_2026-07-27/results/_p0-coverage.json
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const OUT = `${REPO}docs/21_手動受入テスト_2026-07-27`;

/**
 * 直接実施していない P0 の扱い。
 *   by: この証跡のどのケースで実質確認したか / auto: 自動テストで担保 /
 *   staging: 本番相当環境が必要 / out: 運用方針で対象外
 */
const MAP = {
  "AT-AUTH-013": { by: "AT-OPS-002", note: "運営のクリニック作成と owner 招待の発行を画面で実施" },
  "AT-AUTH-028": { by: "AT-NFR-003", note: "他院データが 1 行も読めないことを JWT 直叩きで実測" },
  "AT-CAT-021": { auto: "tests/db-constraints.test.ts", note: "同一部屋・時間重複が 23P01 で拒否される" },
  "AT-CAT-022": { auto: "tests/db-constraints.test.ts", note: "同一スタッフ・時間重複が部屋違いでも拒否される" },
  "AT-CAT-023": { auto: "tests/booking-flow.test.ts", by: "AT-BOOK-021", note: "排他制約による直列化" },
  "AT-CAT-029": { by: "AT-NFR-003", note: "他院 slug / clinic_id でのアクセスを実測" },
  "AT-CAT-030": { by: "AT-AUTH-025", note: "未ログイン・staff・owner 専用ページの権限境界を実測" },
  "AT-BOOK-027": { by: "AT-NFR-031", note: "staff の直接書き込み拒否と未ログイン遮断を実測" },
  "AT-BOOK-016": { by: "AT-BOOK-015", note: "完了後は状態変更・キャンセルの操作自体が出ないことを実測。サーバー側の状態機械も確認" },
  "AT-BOOK-025": { by: "AT-BOOK-015", note: "電話予約→当日 done の通しを、作成ケース(AT-BOOK-008)と状態遷移ケースの連続で実施" },
  "AT-NTF-003": { by: "AT-BOOK-017", note: "承認待ち→確定で患者宛 booking_confirmed が積まれることを実測" },
  "AT-NTF-016": { by: "AT-NTF-013", note: "定期実行を 2 回続けて呼び、2 通目が作られないことを実測" },
  "AT-BOOK-028": { by: "AT-AUTH-032", note: "create/status/cancel/患者検索の監査ログを集計で確認" },
  "AT-PAT-018": { auto: "scripts/e2e-patient-linking.mjs(29 チェック)", note: "名寄せ候補の提示と紐付け" },
  "AT-PAT-019": { auto: "scripts/e2e-patient-linking.mjs", note: "自動マージしないこと" },
  "AT-PAT-021": { out: "運用方針で問診は紙のため対象外(v2-18 未実装)" },
  "AT-PAT-022": { out: "同上" },
  "AT-PAT-023": { out: "同上" },
  "AT-PAT-025": { by: "AT-AUTH-032", note: "patient.list.view / patient.search / patient.view を実測" },
  "AT-PAT-026": { by: "AT-AUTH-032", note: "患者の作成・更新の監査ログを集計で確認" },
  "AT-PAT-027": { by: "AT-PAT-028", note: "未ログインでの患者詳細アクセスを同ケース内で実測" },
  "AT-PAT-029": { by: "AT-NFR-002", note: "anon キーで患者テーブルが 401 になることを実測" },
  "AT-PUB-014": { auto: "tests/booking-flow.test.ts", by: "AT-BOOK-021", note: "同時書き込みの拒否" },
  "AT-NTF-001": { by: "AT-PUB-010", note: "auto モードの挙動を実測(確認ステップ未実装を検出)" },
  "AT-NTF-010": { staging: "Resend を設定した環境での実送信が必要", note: "本文・差出人表示は evidence/_emails/ で確認済み" },
  "AT-NTF-015": { by: "AT-NTF-014", note: "CRON_SECRET 未設定/不一致/一致の 3 通りを実測" },
  "AT-NTF-023": { by: "AT-AUTH-016", note: "owner / staff で /ops が開けないことを実測" },
  "AT-NTF-028": { by: "AT-NFR-007", note: "notifications / audit_logs の他院遮断と偽造不可を実測" },
  "AT-NFR-008": { by: "AT-AUTH-033", note: "is_ops の書き換えが 403 で拒否される" },
  "AT-NFR-015": {
    by: "静的検証(2026-07-27)",
    note: "本番ビルドの .next/static に service role key が 0 件。admin クライアントを import する 14 ファイルすべてがサーバー側",
  },
  "AT-NFR-017": { by: "AT-NTF-014", note: "fail-closed の挙動を実測" },
  "AT-NFR-019": { by: "AT-AUTH-032", note: "患者カルテ閲覧で patient.view が記録されることを実測" },
  "AT-NFR-020": { out: "問診が未実装のため対象外" },
  "AT-NFR-032": { auto: "tests/db-security.test.ts", by: "AT-BOOK-010", note: "複合 FK でのクロステナント遮断" },
};

// P0 の抽出
const p0 = [];
for (const f of readdirSync(`${REPO}docs/20_受け入れテスト`).filter((x) => /^0[1-7]_/.test(x)).sort()) {
  const src = readFileSync(`${REPO}docs/20_受け入れテスト/${f}`, "utf8");
  for (const m of src.matchAll(/^### (AT-[A-Z]+-\d+): (.+?)$([\s\S]*?)(?=^### |\Z)/gm)) {
    if (/\*\*優先度\*\*:\s*P0/.test(m[3])) p0.push({ id: m[1], title: m[2].trim(), src: f });
  }
}

// 実施結果
const done = {};
for (const f of readdirSync(`${OUT}/results`).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
  const d = JSON.parse(readFileSync(`${OUT}/results/${f}`, "utf8"));
  done[d.id] = d.verdict;
}

const rows = p0.map((c) => {
  if (done[c.id]) return { ...c, how: "direct", verdict: done[c.id] };
  const m = MAP[c.id];
  if (!m) return { ...c, how: "todo" };
  if (m.out) return { ...c, how: "out", note: m.out };
  if (m.staging) return { ...c, how: "staging", note: `${m.staging}${m.note ? ` / ${m.note}` : ""}` };
  if (m.auto) return { ...c, how: "auto", ref: m.auto, verdict: m.by ? done[m.by] : undefined, note: m.note };
  return { ...c, how: "covered", ref: m.by, verdict: done[m.by], note: m.note };
});

const count = (h) => rows.filter((r) => r.how === h).length;
const summary = {
  total: rows.length,
  direct: count("direct"),
  covered: count("covered"),
  auto: count("auto"),
  staging: count("staging"),
  out: count("out"),
  todo: count("todo"),
  failed: rows.filter((r) => r.how === "direct" && r.verdict === "FAIL").length,
};
writeFileSync(`${OUT}/results/_p0-coverage.json`, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log("P0 リリースゲートの現在地:", JSON.stringify(summary));
if (summary.todo > 0) {
  console.log("\n未消化:");
  for (const r of rows.filter((x) => x.how === "todo")) console.log(`  ${r.id} ${r.title.slice(0, 60)} (${r.src})`);
}
