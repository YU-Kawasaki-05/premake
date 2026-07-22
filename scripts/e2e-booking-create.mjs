// premake E2E(Playwright 直実行)。前提: pnpm dev 起動済み + supabase seed 投入済み
// 実行: node scripts/e2e-booking-create.mjs
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const SHOT = process.env.SHOT_DIR ?? ".";

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
  await p.fill("#bk-date", ds);
  await p.fill("#bk-time", "10:00");
  console.log("STEP 日時:", ds, "10:00");

  await p.getByRole("button", { name: "予約を作成" }).click();
  await p.waitForTimeout(3000);

  const toastOk = (await p.getByText("予約を作成しました").count()) > 0;
  const formErr = await p.getByText(/してください|不正|失敗|エラー|ください/).allTextContents();
  console.log("STEP 作成結果: toast=", toastOk, "formErr=", JSON.stringify(formErr));

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
  console.log(toastOk ? "\nBOOKING_CREATE_OK" : "\nBOOKING_CREATE_FAILED");
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  await p.screenshot({ path: SHOT + "/booking-fail.png", fullPage: true }).catch(() => {});
}
await browser.close();
