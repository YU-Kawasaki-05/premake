// 手動受け入れテストの画面証跡を取る共通ライブラリ。
// 計画: docs/21_手動受入テスト_2026-07-27/00_実施計画.md
// 前提: pnpm dev 起動済み + ローカル Supabase(db:reset 済み)
//
// 判定は必ず実測値から導出する(verdict の手書きを許さない)。7/26 に E2E で
// 「中断したのに OK 表示」の偽陽性を踏んでいるため、ここが本ライブラリの主目的。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const BASE = "http://localhost:3000";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
export const OUT_DIR = `${REPO}docs/21_手動受入テスト_2026-07-27`;
export const EVIDENCE_DIR = `${OUT_DIR}/evidence`;
export const RESULTS_DIR = `${OUT_DIR}/results`;

// ---- 環境 ----
function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(`${REPO}.env.local`, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}
export const ENV = loadEnv();
export const SB_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
export const IS_LOCAL = !!SB_URL && (SB_URL.includes("127.0.0.1") || SB_URL.includes("localhost"));

export const DEMO_CLINIC_ID = "10000000-0000-4000-a000-000000000001";
export const PASSWORD = "premake-dev";

/** service role で PostgREST を叩く。ローカル以外では即座に止める(本番誤爆防止) */
export async function rest(path, init) {
  if (!IS_LOCAL) throw new Error(`rest() はローカル限定。SB_URL=${SB_URL}`);
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: init?.method === "POST" ? "return=representation" : "",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  return { ok: res.ok, status: res.status, json, text };
}

/**
 * ローカル Supabase の Postgres へ直接 SQL を投げる。
 * PostgREST は public スキーマしか見られないため、auth.users や監査ログの
 * 結合検証は SQL 側で行う。受け入れテスト仕様書の「確認 SQL」をそのまま証跡に残せる。
 * @returns {string[][]} 行 × 列(タブ区切り)。ヘッダなし
 */
export function sql(query) {
  if (!IS_LOCAL) throw new Error("sql() はローカル限定");
  let out;
  try {
    out = execFileSync(
      "docker",
      ["exec", "-i", "supabase_db_premake", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-F", "\t", "-c", query],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (e) {
    // psql のエラー本文(制約名など)は stderr にしか出ない。判定に使えるよう message へ載せ替える
    const detail = String(e.stderr ?? "").trim() || String(e.message ?? e);
    const err = new Error(detail);
    err.stderr = detail;
    throw err;
  }
  return out
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => l.split("\t"));
}

/** 1 行 1 列のスカラを取る。無ければ null */
export function sqlOne(query) {
  const rows = sql(query);
  return rows.length > 0 ? rows[0][0] : null;
}

// ---- ブラウザ ----
let browser = null;
export async function getBrowser() {
  if (!browser) browser = await chromium.launch();
  return browser;
}
export async function closeBrowser() {
  if (browser) await browser.close();
  browser = null;
}

/** ログイン済みのコンテキストとページを返す。失敗時は例外(ケース側で FAIL として記録) */
export async function login(email, { viewport } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext(viewport ? { viewport } : {});
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 }).catch(() => {}),
    page.getByRole("button", { name: "ログイン" }).click(),
  ]);
  await page.waitForTimeout(1200);
  if (page.url().includes("/login")) {
    throw new Error(`ログイン失敗: ${email} — url=${page.url()}`);
  }
  return { ctx, page };
}

/** 未ログインのコンテキスト */
export async function anonContext({ viewport } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext(viewport ? { viewport } : {});
  return { ctx, page: await ctx.newPage() };
}

/** shadcn/Radix の Select を選ぶ(trigger の id を渡す) */
export async function selectOption(page, triggerId, optionText) {
  await page.locator(`#${triggerId}`).click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: optionText, exact: false }).first().click();
  await page.waitForTimeout(250);
}

/**
 * ダイアログの送信ボタンを押す。新規/編集でラベルが変わる(追加/保存/登録)ため候補を順に探す。
 * @returns 押したボタンのラベル
 */
export async function submitDialog(page, names = ["追加", "保存", "登録", "予約を作成"]) {
  for (const name of names) {
    const b = page.getByRole("button", { name, exact: true });
    if ((await b.count()) > 0) {
      await b.first().click();
      return name;
    }
  }
  throw new Error(`送信ボタンが見つからない(候補: ${names.join(" / ")})`);
}

/**
 * 台帳から予約を 1 件作る(前提づくり用)。
 * @returns 採番された予約番号(失敗時 null)
 */
export async function createBookingViaUI(page, { patient, service, member, room, date, time, notes }) {
  await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "新規予約" }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel("患者検索").fill(patient);
  await page.getByRole("button", { name: "検索" }).click();
  await page.waitForTimeout(800);
  await page.locator("ul li button").first().click();
  await page.waitForTimeout(250);
  await selectOption(page, "bk-service", service);
  await selectOption(page, "bk-member", member);
  await selectOption(page, "bk-room", room);
  await page.fill("#bk-date", date);
  await page.fill("#bk-time", time);
  await page.fill("#bk-notes", notes);
  await page.getByRole("button", { name: "予約を作成" }).click();
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(400);
    if ((await page.getByRole("dialog").count()) === 0) break;
  }
  return sqlOne(
    `select booking_no from bookings where clinic_id = '${DEMO_CLINIC_ID}' and notes = '${notes.replace(/'/g, "''")}' limit 1`,
  );
}

/** toast(sonner)の文言が出るまで待つ。出たら true */
export async function waitToast(page, textRe, timeout = 6000) {
  try {
    await page.getByText(textRe).first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

// ---- ケース記録 ----
/**
 * @param {{id:string, priority:string, title:string, phase:string, refs?:string[],
 *          intent?:string, spec?:string}} meta
 */
export function newCase(meta) {
  const dir = `${EVIDENCE_DIR}/${meta.id}`;
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(RESULTS_DIR, { recursive: true });

  const rec = {
    ...meta,
    startedAt: new Date().toISOString(),
    steps: [],
    dbChecks: [],
    issues: [],
    notes: meta.notes ?? "",
    // NA/PARTIAL は「検証不能・一部未実装」を明示するときにケース側から立てる
    naReason: null,
    partialReason: null,
    aborted: false,
    verdict: null,
  };
  let n = 0;

  /** スクリーンショットを撮ってステップを記録する。checks が 1 つでも false なら ok=false */
  async function step({ label, action, expect, actual, note, page, checks = [], shot = true, fullPage = false }) {
    n += 1;
    const nn = String(n).padStart(2, "0");
    const files = [];
    if (page && shot) {
      const slug = label.replace(/[^\w一-龠ぁ-んァ-ヶー]+/g, "_").slice(0, 40);
      const file = `${nn}_${slug}.png`;
      await page.screenshot({ path: `${dir}/${file}`, fullPage }).catch(() => {});
      if (existsSync(`${dir}/${file}`)) files.push(file);
    }
    const ok = checks.every((c) => c.ok);
    rec.steps.push({ n, label, action, expect, actual, note, checks, evidence: files, ok });
    console.log(`  ${ok ? "✓" : "✗"} [${nn}] ${label}${actual ? ` — ${actual}` : ""}`);
    for (const c of checks.filter((c) => !c.ok)) console.log(`      ✗ ${c.label}: ${c.detail ?? ""}`);
    return ok;
  }

  /** DB 実測。判定根拠を SQL/REST クエリ文字列として残す */
  function dbCheck({ label, query, expect, actual, ok }) {
    rec.dbChecks.push({ label, query, expect, actual, ok });
    console.log(`  ${ok ? "✓" : "✗"} [DB] ${label} — ${actual}`);
    return ok;
  }

  /**
   * @param {{severity?:string, summary:string, detail?:string, impact?:string,
   *          workaround?:string, status?:string, fix?:string, evidence?:string}} i
   *   status: "open" | "fixed"(この作業内で修正した) / evidence: evidence/_issues/ 配下のファイル名
   */
  function issue({ severity = "medium", summary, detail, impact, workaround, status = "open", fix, evidence }) {
    rec.issues.push({ severity, summary, detail, impact, workaround, status, fix, evidence });
    console.log(`  ! ISSUE(${severity}/${status}) ${summary}`);
  }

  function na(reason) {
    rec.naReason = reason;
  }
  function partial(reason) {
    rec.partialReason = reason;
  }
  function abort(err) {
    rec.aborted = true;
    rec.abortError = String(err).slice(0, 500);
    console.log(`  ✗ ABORTED: ${rec.abortError}`);
  }

  function finish() {
    const allOk = rec.steps.every((s) => s.ok) && rec.dbChecks.every((c) => c.ok);
    if (rec.aborted) rec.verdict = "FAIL";
    else if (rec.naReason) rec.verdict = "NA";
    else if (!allOk) rec.verdict = "FAIL";
    else if (rec.partialReason) rec.verdict = "PARTIAL";
    else rec.verdict = "PASS";
    rec.finishedAt = new Date().toISOString();
    writeFileSync(`${RESULTS_DIR}/${meta.id}.json`, `${JSON.stringify(rec, null, 2)}\n`);
    const mark = { PASS: "PASS", PARTIAL: "PARTIAL", NA: "N/A", FAIL: "FAIL" }[rec.verdict];
    console.log(`→ ${meta.id} ${mark} (steps=${rec.steps.length} db=${rec.dbChecks.length})\n`);
    return rec.verdict;
  }

  console.log(`\n=== ${meta.id} (${meta.priority}) ${meta.title} ===`);
  return { rec, step, dbCheck, issue, na, partial, abort, finish, dir };
}

/** ケースを try/catch で包み、例外は必ず FAIL として記録する */
export async function runCase(meta, body) {
  const c = newCase(meta);
  try {
    await body(c);
  } catch (e) {
    c.abort(e);
  }
  return c.finish();
}

// ---- 便利関数 ----
/** JST の日付文字列(YYYY-MM-DD)。offsetDays で前後にずらす */
export function jstDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(d);
}

/** GET /api/cron を叩いて通知キューを送信させる */
export async function runCron() {
  const secret = ENV.CRON_SECRET;
  const res = await fetch(`${BASE}/api/cron`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** 実行サマリを 1 行で出す(スクリプト末尾用)。非ゼロ終了の判断もここで行う */
export function summarize(verdicts) {
  const count = (v) => verdicts.filter((x) => x === v).length;
  const line = `PASS=${count("PASS")} PARTIAL=${count("PARTIAL")} NA=${count("NA")} FAIL=${count("FAIL")}`;
  console.log(`\n===== ${line} =====`);
  return count("FAIL") === 0;
}
