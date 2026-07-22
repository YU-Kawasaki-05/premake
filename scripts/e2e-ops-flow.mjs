// premake E2E(受付運用フロー / No.35・No.36)。前提: pnpm dev 起動済み + supabase seed 投入済み
// 実行: node scripts/e2e-ops-flow.mjs
//
// 検証内容:
//  (a) No.35: nurse1(鈴木・staff)がスケジュール画面で他人(nurse2・田中)の施術枠を作成→削除できる
//  (b) No.36: 院内予約ダイアログの担当候補に「佐藤院長」(is_bookable=false, active)が表示される
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT = process.env.SHOT_DIR ?? process.env.TMPDIR ?? "/tmp";
const NOTE_MARK = `E2E_OPS_${Math.floor(Date.now() / 1000)}`;

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---- service role でのローカル DB 掃除(再実行耐性) ----
function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}
const env = loadEnv();
const REST = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const isLocal = REST && (REST.includes("127.0.0.1") || REST.includes("localhost"));

function svcHeaders() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}` };
}
async function cleanupBlocks() {
  if (!REST || !KEY || !isLocal) return; // 本番誤爆防止
  await fetch(`${REST}/rest/v1/schedule_blocks?note=like.${encodeURIComponent("E2E_OPS*")}`, {
    method: "DELETE",
    headers: svcHeaders(),
  }).catch(() => {});
}
// この実行が作成した枠(NOTE_MARK)の件数を DB 直接取得(トーストは短命なので DOM でなく DB を正とする)
async function markedBlockCount() {
  if (!REST || !KEY) return -1;
  const res = await fetch(
    `${REST}/rest/v1/schedule_blocks?note=eq.${encodeURIComponent(NOTE_MARK)}&select=id,member_id`,
    { headers: svcHeaders() },
  ).catch(() => null);
  if (!res || !res.ok) return -1;
  return await res.json();
}
await cleanupBlocks();
const NURSE2_MEMBER_ID = "20000000-0000-4000-a000-000000000003"; // 田中(seed)

// 施術枠の衝突を避けるため、seed(明日・明後日)から十分離れた未来日を使う
function jstDatePlus(days) {
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  nowJst.setUTCDate(nowJst.getUTCDate() + days);
  return nowJst.toISOString().slice(0, 10);
}
const TARGET_DATE = jstDatePlus(35);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));

async function optionTexts() {
  const opts = p.locator('[role="option"]');
  await opts.first().waitFor({ timeout: 5000 });
  return await opts.allInnerTexts();
}

try {
  // ---- ログイン: nurse1(鈴木・staff) ----
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("#email", "nurse1@demo.local");
  await p.fill("#password", "premake-dev");
  await p.getByRole("button", { name: "ログイン" }).click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  record("login(nurse1・staff)", !p.url().endsWith("/login"), p.url().replace(BASE, ""));

  // ===================================================================
  // (a) No.35: nurse1 が他人(nurse2・田中)の施術枠を作成できる
  // ===================================================================
  await p.goto(`${BASE}/demo/schedule?w=${TARGET_DATE}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "施術枠を追加" }).first().click();
  await p.waitForTimeout(500);
  const dialogOpen = (await p.getByRole("dialog").count()) > 0;
  record("スケジュール追加ダイアログ表示", dialogOpen);

  // 担当スタッフ select が staff でも操作可能(No.35 の UI 緩和)で、田中(nurse2)を選べる
  await p.locator("#sb-member").click();
  await p.waitForTimeout(300);
  const memberOpts = await optionTexts();
  const hasTanaka = memberOpts.some((t) => t.includes("田中"));
  record("担当 select に他人(田中/nurse2)が選択可能", hasTanaka, JSON.stringify(memberOpts));
  await p.getByRole("option", { name: "田中" }).click();
  await p.waitForTimeout(200);

  // 部屋(先頭)
  await p.locator("#sb-room").click();
  await p.waitForTimeout(300);
  await p.locator('[role="option"]').first().click();
  await p.waitForTimeout(200);

  // 日付・時刻・メモ(掃除マーカー)
  await p.fill("#sb-date", TARGET_DATE);
  await p.fill("#sb-start", "09:00");
  await p.fill("#sb-end", "10:00");
  await p.fill("#sb-note", NOTE_MARK);
  await p.getByRole("button", { name: "登録" }).click();

  // 反映は DB を正とする(トーストは短命)。作成した枠が田中(nurse2)名義で 1 件入るか。
  let created = [];
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(500);
    created = await markedBlockCount();
    if (Array.isArray(created) && created.length >= 1) break;
  }
  const createOk =
    Array.isArray(created) && created.length === 1 && created[0].member_id === NURSE2_MEMBER_ID;
  record("他人(田中/nurse2)の施術枠を作成(DB確認)", createOk, JSON.stringify(created));

  // 作成結果が週ビューに反映(田中の枠が表示される)
  await p.goto(`${BASE}/demo/schedule?w=${TARGET_DATE}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const blockVisible = (await p.getByText(/田中/).count()) > 0;
  record("作成した田中の枠が週ビューに表示", blockVisible);

  // ---- 削除: nurse1 が他人(田中)の枠を削除できる ----
  const delBtn = p.getByRole("button", { name: "枠を削除" });
  const delCount = await delBtn.count();
  if (delCount > 0) {
    await delBtn.first().click({ force: true });
    let delOk = false;
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(500);
      const remain = await markedBlockCount();
      if (Array.isArray(remain) && remain.length === 0) {
        delOk = true;
        break;
      }
    }
    record("他人(田中)の施術枠を削除(DB確認)", delOk);
  } else {
    record("他人(田中)の施術枠を削除(DB確認)", false, "削除ボタン(枠を削除)が表示されていない");
  }

  // ===================================================================
  // (b) No.36: 院内予約ダイアログの担当候補に 佐藤院長(is_bookable=false)が出る
  // ===================================================================
  await p.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "新規予約" }).first().click();
  await p.waitForTimeout(500);
  const bkDialogOpen = (await p.getByRole("dialog").count()) > 0;
  record("新規予約ダイアログ表示", bkDialogOpen);

  await p.locator("#bk-member").click();
  await p.waitForTimeout(300);
  const bkMemberOpts = await optionTexts();
  const hasDirector = bkMemberOpts.some((t) => t.includes("佐藤院長"));
  record("担当候補に佐藤院長(is_bookable=false, active)が表示", hasDirector, JSON.stringify(bkMemberOpts));

  await p.screenshot({ path: `${SHOT}/ops-flow.png`, fullPage: true }).catch(() => {});
} catch (e) {
  record("EXCEPTION", false, String(e).slice(0, 300));
  await p.screenshot({ path: `${SHOT}/ops-flow-fail.png`, fullPage: true }).catch(() => {});
}

await cleanupBlocks();
await browser.close();

const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\nPAGEERRORS: ${errs.length} ${JSON.stringify(errs.slice(0, 3))}`);
console.log(`\nSUMMARY: ${passed}/${total} passed`);
console.log(passed === total ? "\nOPS_FLOW_OK" : "\nOPS_FLOW_FAILED");
process.exit(passed === total ? 0 : 1);
