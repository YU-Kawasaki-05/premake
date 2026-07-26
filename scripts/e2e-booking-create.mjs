// premake E2E(Playwright 直実行)。前提: pnpm dev 起動済み + supabase seed 投入済み
// 実行: node scripts/e2e-booking-create.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const SHOT = process.env.SHOT_DIR ?? (process.env.TMPDIR ?? "/tmp");

// 再実行耐性: 前回実行が残した E2E 患者・予約を削除(ローカル Supabase 限定)
async function cleanupPreviousRuns() {
  let env = {};
  try {
    env = Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return;
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) return; // 本番誤爆防止
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const q = encodeURIComponent("E2E患者*");
  const res = await fetch(`${url}/rest/v1/patients?name=like.${q}&select=id`, { headers: h });
  if (!res.ok) return;
  const pts = await res.json();
  for (const pt of pts) {
    await fetch(`${url}/rest/v1/bookings?patient_id=eq.${pt.id}`, { method: "DELETE", headers: h });
    await fetch(`${url}/rest/v1/patients?id=eq.${pt.id}`, { method: "DELETE", headers: h });
  }
  if (pts.length > 0) console.log("STEP 掃除: 前回のE2E患者を削除:", pts.length, "件");
}
await cleanupPreviousRuns();

const browser = await chromium.launch();
const ctx = await browser.newContext();
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));

async function pickSelect(triggerId, index = 0) {
  await p.locator(`#${triggerId}`).click();
  await p.waitForTimeout(400);
  const opts = p.locator('[role="option"]');
  const n = await opts.count();
  await opts.nth(index).click();
  await p.waitForTimeout(250);
  return n;
}

try {
  await p.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await p.fill("#email", "owner@demo.local");
  await p.fill("#password", "premake-dev");
  await p.getByRole("button", { name: "ログイン" }).click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  await p.goto(BASE + "/demo", { waitUntil: "networkidle" });
  console.log("STEP login+台帳: url=", p.url().replace(BASE, ""));

  await p.getByRole("button", { name: "新規予約" }).first().click();
  await p.waitForTimeout(600);
  console.log("STEP ダイアログ:", (await p.getByRole("dialog").count()) > 0 ? "OK" : "FAIL");

  await p.getByRole("button", { name: "新規患者" }).click();
  const uniq = "E2E患者" + (Math.floor(Date.now() / 1000) % 100000);
  await p.fill("#np-name", uniq);
  await p.fill("#np-kana", "いーつーいーかんじゃ");
  console.log("STEP 新規患者:", uniq);

  const nSvc = await pickSelect("bk-service", 0);
  const nMem = await pickSelect("bk-member", 0);
  const nRoom = await pickSelect("bk-room", 0);
  console.log("STEP Select 候補数: service=", nSvc, "member=", nMem, "room=", nRoom);

  const now = new Date();
  const t = new Date(now.getTime() + 24 * 3600 * 1000);
  const ds = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  // seed のサンプル予約(明日 10:30〜13:00・施術室1・田中)と衝突しない時刻を使う
  await p.fill("#bk-date", ds);
  await p.fill("#bk-time", "14:00");
  console.log("STEP 日時:", ds, "14:00");

  await p.getByRole("button", { name: "予約を作成" }).click();
  // トーストは短命なので、ダイアログクローズ(成功時の挙動)も成功シグナルとして扱う
  let toastOk = false;
  let dialogClosed = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(500);
    if ((await p.getByText("予約を作成しました").count()) > 0) toastOk = true;
    if ((await p.getByRole("dialog").count()) === 0) dialogClosed = true;
    if (toastOk || dialogClosed) break;
  }
  const formErr = await p.getByText(/ください|不正|失敗|エラー/).allTextContents();
  console.log(
    "STEP 作成結果: toast=", toastOk, "dialogClosed=", dialogClosed,
    "formErr=", JSON.stringify(formErr),
  );
  const createOk = toastOk || (dialogClosed && formErr.length === 0);

  const dlg = p.getByRole("dialog");
  if ((await dlg.count()) > 0) {
    console.log("DIALOG OPEN. text=", JSON.stringify((await dlg.innerText()).slice(0, 600)));
  } else {
    console.log("DIALOG CLOSED");
  }
  await p.screenshot({ path: SHOT + "/booking-after.png", fullPage: true }).catch(() => {});

  await p.goto(BASE + "/demo", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  console.log("STEP 台帳反映:", (await p.getByText(uniq).count()) > 0 ? "OK(当日タブ)" : "未表示(日付タブ違いの可能性)");

  console.log("PAGEERRORS:", errs.length, errs.slice(0, 3));
  console.log(createOk ? "\nBOOKING_CREATE_OK" : "\nBOOKING_CREATE_FAILED");
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  await p.screenshot({ path: SHOT + "/booking-fail.png", fullPage: true }).catch(() => {});
}
await browser.close();
