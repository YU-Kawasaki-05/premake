// premake E2E(Playwright 直実行)。前提: pnpm dev 起動済み + supabase seed 投入済み
// 実行: node scripts/e2e-mvp-access.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const results = [];
function rec(area, name, ok, detail) {
  results.push({ area, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${area}] ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();

// ---- Part 1: 未ログインでの到達性 ----
const anon = await browser.newContext();
const publicPages = [
  ["/login", "スタッフログイン"],
  ["/c/demo", null],
  ["/c/demo/reserve", null],
  ["/c/demo/lookup", null],
  ["/privacy", null],
  ["/terms", null],
];
for (const [path, expectText] of publicPages) {
  const p = await anon.newPage();
  try {
    const resp = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    const status = resp?.status();
    const url = p.url();
    let ok = status === 200 && url.includes(path.split("?")[0]);
    let detail = `status=${status} url=${url.replace(BASE, "")}`;
    if (expectText) {
      const found = await p.getByText(expectText).count();
      ok = ok && found > 0;
      detail += ` text("${expectText}")=${found}`;
    }
    rec("公開到達性", path, ok, detail);
  } catch (e) {
    rec("公開到達性", path, false, String(e).slice(0, 120));
  }
  await p.close();
}

// 未ログインで管理ページ → /login へ弾かれる or notFound
const protectedPaths = ["/demo", "/demo/patients", "/demo/schedule", "/demo/settings"];
for (const path of protectedPaths) {
  const p = await anon.newPage();
  try {
    const resp = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    const url = p.url();
    const status = resp?.status();
    // 期待: /login へリダイレクト、または 404(存在秘匿)。台帳がそのまま見えたら FAIL
    const redirectedToLogin = url.includes("/login");
    const is404 = status === 404 || (await p.getByText(/404|見つかりません|not found/i).count()) > 0;
    const ok = redirectedToLogin || is404;
    rec("認証ガード", `未ログイン ${path}`, ok, `status=${status} url=${url.replace(BASE, "")} ${redirectedToLogin ? "→login" : is404 ? "→404" : "素通り?"}`);
  } catch (e) {
    rec("認証ガード", `未ログイン ${path}`, false, String(e).slice(0, 120));
  }
  await p.close();
}
await anon.close();

// ---- Part 2: ログイン ----
async function loginAs(email, password, expectUrlPart) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.fill("#email", email);
  await p.fill("#password", password);
  await Promise.all([
    p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 }).catch(() => {}),
    p.getByRole("button", { name: "ログイン" }).click(),
  ]);
  await p.waitForTimeout(1500);
  return { ctx, p, url: p.url() };
}

// 誤パスワード
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await p.fill("#email", "owner@demo.local");
  await p.fill("#password", "wrong-password");
  await p.getByRole("button", { name: "ログイン" }).click();
  await p.waitForTimeout(1500);
  const errCount = await p.getByText(/正しくありません|エラー|失敗/).count();
  const stillLogin = p.url().includes("/login");
  rec("ログイン", "誤パスワードは拒否", stillLogin && errCount > 0, `url=${p.url().replace(BASE, "")} err=${errCount}`);
  await ctx.close();
}

// owner
const owner = await loginAs("owner@demo.local", "premake-dev", "/demo");
rec("ログイン", "owner → /demo", owner.url.includes("/demo") && !owner.url.includes("/login"), `url=${owner.url.replace(BASE, "")}`);

// nurse
const nurse = await loginAs("nurse1@demo.local", "premake-dev", "/demo");
rec("ログイン", "nurse1 → /demo", nurse.url.includes("/demo") && !nurse.url.includes("/login"), `url=${nurse.url.replace(BASE, "")}`);
await nurse.ctx.close();

// ops
const ops = await loginAs("ops@premake.local", "premake-dev", "/ops");
rec("ログイン", "ops → /ops", ops.url.includes("/ops"), `url=${ops.url.replace(BASE, "")}`);
await ops.ctx.close();

// ---- Part 3: owner セッションで管理ページ到達性 ----
const adminPages = [
  ["/demo", "台帳|予約|ダッシュボード"],
  ["/demo/patients", "患者"],
  ["/demo/schedule", "枠|スケジュール|週"],
  ["/demo/services", "メニュー|施術"],
  ["/demo/rooms", "部屋|担当"],
  ["/demo/staff", "スタッフ|メンバー"],
  ["/demo/settings", "設定|クリニック"],
  ["/demo/questionnaires", "問診"],
];
for (const [path, textRe] of adminPages) {
  const p = await owner.ctx.newPage();
  try {
    const resp = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
    const status = resp?.status();
    // 「500」単独は価格表示(¥16,500 等)に誤マッチするため除外
    const bodyHasErr =
      (await p.getByText(/Application error|Unhandled|Internal Server Error/i).count()) > 0;
    const textCount = await p.getByText(new RegExp(textRe)).count();
    const ok = status === 200 && !bodyHasErr && textCount > 0;
    rec("管理到達性(owner)", path, ok, `status=${status} match=${textCount} err=${bodyHasErr}`);
  } catch (e) {
    rec("管理到達性(owner)", path, false, String(e).slice(0, 120));
  }
  await p.close();
}
await owner.ctx.close();

await browser.close();

// ---- 集計 ----
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n===== SUMMARY: ${pass}/${results.length} passed, ${fail} failed =====`);
if (fail > 0) {
  console.log("FAILED:");
  for (const r of results.filter((x) => !x.ok)) console.log(`  - [${r.area}] ${r.name}: ${r.detail}`);
}
const MIN_CHECKS = 22; // 期待するチェック数(下回る = 途中で飛ばされた)
if (results.length < MIN_CHECKS)
  console.log(`INCOMPLETE: チェック数 ${results.length} が期待 ${MIN_CHECKS} を下回っています`);
process.exit(fail === 0 && results.length >= MIN_CHECKS ? 0 : 1);
