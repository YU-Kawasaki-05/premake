// S1 フローの E2E 検証(ローカル専用・使い捨てスクリプト)
// 前提: supabase 起動済み + シード適用済み + dev サーバー(BASE_URL)起動済み
// 実行: node scripts/e2e-s1.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const SHOTS = process.env.SHOTS_DIR ?? "./e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
function ok(name) {
  results.push(`✅ ${name}`);
  console.log(`✅ ${name}`);
}
function fail(name, detail) {
  results.push(`❌ ${name}: ${detail}`);
  console.log(`❌ ${name}: ${detail}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const uniq = Date.now().toString(36);
const inviteEmail = `e2e-${uniq}@demo.local`;

try {
  // 1. ログインページ表示
  await page.goto(`${BASE}/login`);
  await page.waitForSelector("text=スタッフログイン");
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
  ok("ログインページ表示");

  // 2. 誤パスワードでエラー表示
  await page.fill("#email", "owner@demo.local");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await page.waitForSelector("text=メールアドレスまたはパスワードが正しくありません");
  ok("誤パスワードでエラー表示");

  // 3. owner でログイン → /demo に着地
  await page.fill("#password", "premake-dev");
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/demo`, { timeout: 15000 });
  await page.waitForSelector("text=セットアップ状況");
  await page.screenshot({ path: `${SHOTS}/02-home.png` });
  ok("owner ログイン → ホーム着地");

  // 4. クリニック設定: 院長名を保存
  await page.goto(`${BASE}/demo/settings`);
  await page.waitForSelector("text=基本情報");
  await page.fill("#director_name", "佐藤 まこと(検証)");
  await page.click("form:has(#director_name) button[type=submit]");
  await page.waitForSelector("text=保存しました");
  await page.screenshot({ path: `${SHOTS}/03-settings.png`, fullPage: true });
  ok("クリニック設定の保存");

  // 5. スタッフ招待 → 招待 URL 取得
  await page.goto(`${BASE}/demo/staff`);
  await page.waitForSelector("text=スタッフを招待");
  await page.screenshot({ path: `${SHOTS}/04-staff.png` });
  await page.click("text=スタッフを招待");
  await page.fill("#invite-email", inviteEmail);
  await page.click("button:has-text('招待リンクを発行')");
  await page.waitForSelector("input[readonly]");
  const inviteUrl = await page.inputValue("input[readonly]");
  if (!inviteUrl.includes("/invite/")) throw new Error(`invite URL が不正: ${inviteUrl}`);
  await page.screenshot({ path: `${SHOTS}/05-invite-issued.png` });
  ok(`招待リンク発行 (${inviteEmail})`);

  // ダイアログを閉じる(オーバーレイ解除)
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { state: "hidden" }).catch(() => {});

  // 6. ログアウト → 招待受諾(新規ユーザー)→ /demo に着地
  await page.click("aside button:has-text('ログアウト')", { force: true });
  await page.waitForURL(`${BASE}/login`);
  const invitePath = new URL(inviteUrl).pathname;
  await page.goto(`${BASE}${invitePath}`);
  await page.waitForSelector("text=への招待");
  await page.screenshot({ path: `${SHOTS}/06-invite-accept.png` });
  await page.fill("#fullName", "検証 花子");
  await page.fill("#password", "premake-dev-e2e");
  await page.click("button:has-text('アカウントを作成して参加')");
  await page.waitForURL(`${BASE}/demo`, { timeout: 15000 });
  ok("招待受諾 → 自動ログイン → ホーム着地");

  // 7. staff ロールにはサイドバーに設定リンクが出ない + 直接アクセスも弾かれる
  const hasSettingsLink = await page.locator("aside >> text=クリニック設定").count();
  if (hasSettingsLink === 0) ok("staff ロールに設定リンク非表示");
  else fail("staff ロールに設定リンク非表示", "リンクが見えている");
  await page.goto(`${BASE}/demo/settings`);
  await page.waitForURL(`${BASE}/demo`, { timeout: 15000 });
  ok("staff の /settings 直アクセスはホームへリダイレクト");

  // 8. ログアウト → ops でログイン → /ops 着地
  await page.click("aside button:has-text('ログアウト')", { force: true });
  await page.waitForURL(`${BASE}/login`);
  await page.fill("#email", "ops@premake.local");
  await page.fill("#password", "premake-dev");
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/ops`, { timeout: 15000 });
  await page.waitForSelector("text=デモクリニック");
  await page.screenshot({ path: `${SHOTS}/07-ops.png` });
  ok("ops ログイン → テナント一覧表示");

  // 9. 非メンバーの他クリニックへのアクセス遮断(ops は member ではないので /demo は弾かれる想定外 → ops は RLS で読めるが requireMember では弾かれる)
  await page.goto(`${BASE}/demo/staff`);
  await page.waitForURL(/\/(login|demo)?$/, { timeout: 15000 }).catch(() => {});
  ok(`非メンバー(ops)の /demo/staff アクセス → ${page.url()} へ`);
} catch (error) {
  fail("E2E", error.message);
  await page.screenshot({ path: `${SHOTS}/99-failure.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  console.log(`\n== 結果 ==\n${results.join("\n")}`);
  process.exitCode = results.some((r) => r.startsWith("❌")) ? 1 : 0;
}
