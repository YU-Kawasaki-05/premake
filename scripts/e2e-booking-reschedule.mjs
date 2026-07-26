// premake E2E: 院内予約のリスケ(日時変更)フロー
// @implements v2-11 予約変更(リスケ) / v2-23 通知(booking_rescheduled) / v2-24 Cron 送信
// 前提: pnpm dev 起動済み + ローカル Supabase seed 投入済み
// 実行: node scripts/e2e-booking-reschedule.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT = process.env.SHOT_DIR ?? (process.env.TMPDIR ?? "/tmp");
const RESCHEDULE_EMAIL = "e2e-reschedule@example.com";

// --- 集計 ---
const results = [];
// 途中で例外中断した場合に「全項目 green」と誤報しないためのフラグ
let aborted = false;
function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}
function step(msg) {
  console.log("STEP " + msg);
}

// --- .env.local(e2e-booking-create.mjs と同方式)---
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
const ENV = loadEnv();
const SB_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
const isLocal = !!SB_URL && (SB_URL.includes("127.0.0.1") || SB_URL.includes("localhost"));

async function rest(path, init) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
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

// --- 掃除: 前回実行が残した E2E 患者・予約・通知を削除(ローカル限定)---
async function cleanupPreviousRuns() {
  if (!SB_URL || !SB_KEY) {
    step("掃除: env 未取得のためスキップ");
    return;
  }
  if (!isLocal) {
    console.log("ABORT: Supabase URL がローカルではありません:", SB_URL);
    process.exit(1);
  }
  await rest(`notifications?recipient_email=eq.${encodeURIComponent(RESCHEDULE_EMAIL)}`, {
    method: "DELETE",
  });
  const q = encodeURIComponent("E2E患者*");
  const found = await rest(`patients?name=like.${q}&select=id`);
  const ids = Array.isArray(found.json) ? found.json.map((r) => r.id) : [];
  // bookings 削除で booking_sessions/booking_access_tokens は cascade、notifications は booking_id が null になる
  for (const id of ids) {
    await rest(`bookings?patient_id=eq.${id}`, { method: "DELETE" });
    await rest(`patients?id=eq.${id}`, { method: "DELETE" });
  }
  step(`掃除: 前回のE2E患者を削除: ${ids.length} 件`);
}

// JST カレンダー日付(offsetDays 日後)を yyyy-mm-dd で返す
function jstDate(offsetDays) {
  const jst = new Date(Date.now() + offsetDays * 86400000 + 9 * 3600000);
  return jst.toISOString().slice(0, 10);
}

// tstzrange 下限を JST hh:mm に変換
function rangeStartHhmm(rangeStr) {
  const m = rangeStr.match(/^\[?"?([^",]+)"?,/);
  if (!m) return null;
  const d = new Date(Date.parse(m[1]) + 9 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
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
  await opts.nth(index).click();
  await p.waitForTimeout(250);
}

async function triggerCron() {
  try {
    const cres = await fetch(`${BASE}/api/cron`);
    const body = await cres.json().catch(() => null);
    return { ok: cres.ok && body?.ok === true, body };
  } catch (e) {
    return { ok: false, body: { fetchError: String(e).slice(0, 120) } };
  }
}

let bookingId = null;
let bookingNo = null;
const tomorrow = jstDate(1);
const uniq = "E2E患者" + (Math.floor(Date.now() / 1000) % 100000);

try {
  // 1) owner ログイン → 台帳
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("#email", "owner@demo.local");
  await p.fill("#password", "premake-dev");
  await p.getByRole("button", { name: "ログイン" }).click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  await p.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  rec("owner ログイン成功", !p.url().endsWith("/login"), `url=${p.url().replace(BASE, "")}`);

  // 2) 新規予約作成(明日 14:00)
  await p.getByRole("button", { name: "新規予約" }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "新規患者" }).click();
  await p.fill("#np-name", uniq);
  await p.fill("#np-kana", "いーつーいーかんじゃ");
  await pickSelect("bk-service", 0);
  await pickSelect("bk-member", 0);
  await pickSelect("bk-room", 0);
  await p.fill("#bk-date", tomorrow);
  await p.fill("#bk-time", "14:00");
  step(`新規予約: ${uniq} ${tomorrow} 14:00`);
  await p.getByRole("button", { name: "予約を作成" }).click();

  let createOk = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(500);
    if ((await p.getByText("予約を作成しました").count()) > 0) {
      createOk = true;
      break;
    }
    if ((await p.getByRole("dialog").count()) === 0) {
      createOk = true;
      break;
    }
  }
  rec("予約作成(明日14:00)成功", createOk);
  if (!createOk) throw new Error("予約作成に失敗したため中断");

  // 3) DB から予約を特定し、患者にメールを付与(リスケ通知の宛先確保)
  const pres = await rest(`patients?name=eq.${encodeURIComponent(uniq)}&select=id`);
  const patientId = Array.isArray(pres.json) && pres.json[0] ? pres.json[0].id : null;
  const bres = await rest(
    `bookings?patient_id=eq.${patientId}&select=id,booking_no,status,service_id`,
  );
  const bk = Array.isArray(bres.json) && bres.json[0] ? bres.json[0] : null;
  bookingId = bk?.id ?? null;
  bookingNo = bk?.booking_no ?? null;
  rec("DB: 作成予約が confirmed で存在", bk?.status === "confirmed", `no=${bookingNo} status=${bk?.status}`);
  if (patientId) {
    await rest(`patients?id=eq.${patientId}`, {
      method: "PATCH",
      body: JSON.stringify({ email: RESCHEDULE_EMAIL }),
    });
  }

  // 作成直後の開始時刻(14:00 のはず)
  const sres0 = await rest(
    `booking_sessions?booking_id=eq.${bookingId}&select=time_range&order=time_range&limit=1`,
  );
  const before = Array.isArray(sres0.json) && sres0.json[0] ? rangeStartHhmm(sres0.json[0].time_range) : null;
  rec("DB: 作成予約の開始が 14:00", before === "14:00", `start=${before}`);

  // 4) 台帳(明日)でチップを開く
  await p.goto(`${BASE}/demo?d=${tomorrow}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const chip = p.locator("button").filter({ hasText: uniq });
  const chipCount = await chip.count();
  rec("台帳に作成予約チップが表示される", chipCount >= 1, `候補=${chipCount}`);
  if (chipCount < 1) throw new Error("チップが見つからないため中断");
  await chip.first().click();
  await p.waitForTimeout(400);

  // 5) 「予約を変更」→ ダイアログで 15:00 に変更 → 保存
  const rsBtn = p.getByRole("button", { name: "予約を変更" });
  const hasRsBtn = (await rsBtn.count()) > 0;
  rec("ドロワーに「予約を変更」ボタンが存在する", hasRsBtn);
  if (!hasRsBtn) throw new Error("リスケボタンが無いため中断");
  await rsBtn.first().click();
  await p.locator("#rs-time").waitFor({ state: "visible", timeout: 10000 });
  await p.fill("#rs-time", "15:00");
  step("リスケ: 15:00 へ変更");
  await p.getByRole("button", { name: "変更を保存" }).click();

  let rescheduleUiOk = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(500);
    if ((await p.getByText("予約を変更しました").count()) > 0) {
      rescheduleUiOk = true;
      break;
    }
    if ((await p.getByRole("dialog").count()) === 0) {
      rescheduleUiOk = true;
      break;
    }
  }
  const formErr = await p.getByText(/ください|不正|失敗|競合|埋まって/).allTextContents();
  rec("リスケ UI: 成功(トースト/ダイアログクローズ)", rescheduleUiOk, `formErr=${JSON.stringify(formErr.slice(0, 2))}`);
  await p.screenshot({ path: SHOT + "/booking-reschedule.png", fullPage: true }).catch(() => {});

  // 6) DB: time_range が 15:00 開始に更新されている
  await p.waitForTimeout(500);
  const sres1 = await rest(
    `booking_sessions?booking_id=eq.${bookingId}&select=time_range,status&order=time_range&limit=1`,
  );
  const after = Array.isArray(sres1.json) && sres1.json[0] ? rangeStartHhmm(sres1.json[0].time_range) : null;
  rec("DB: リスケ後の開始が 15:00", after === "15:00", `start=${after}`);

  // 7) DB: booking_rescheduled 通知が queued
  const nres = await rest(
    `notifications?booking_id=eq.${bookingId}&kind=eq.booking_rescheduled&select=recipient_type,recipient_email,status`,
  );
  const notifs = Array.isArray(nres.json) ? nres.json : [];
  const notif = notifs.find((n) => n.recipient_email === RESCHEDULE_EMAIL);
  step(`booking_rescheduled 通知: ${JSON.stringify(notifs)}`);
  rec(
    "DB: 患者宛 booking_rescheduled(queued)が追加",
    !!notif && notif.status === "queued" && notif.recipient_type === "patient",
    notif ? `to=${notif.recipient_email} status=${notif.status}` : "見つからない",
  );

  // 8) cron 実行 → sent
  const cron = await triggerCron();
  rec("cron: /api/cron が ok=true", cron.ok, `body=${JSON.stringify(cron.body)}`);
  await p.waitForTimeout(500);
  const nres2 = await rest(
    `notifications?booking_id=eq.${bookingId}&kind=eq.booking_rescheduled&select=recipient_email,status,sent_at`,
  );
  const sent = (Array.isArray(nres2.json) ? nres2.json : []).find(
    (n) => n.recipient_email === RESCHEDULE_EMAIL,
  );
  step(`cron 後の booking_rescheduled: ${JSON.stringify(nres2.json)}`);
  rec("cron 後: 患者宛 booking_rescheduled が sent", sent?.status === "sent", `status=${sent?.status}`);

  console.log("PAGEERRORS:", errs.length, errs.slice(0, 3));
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  aborted = true;
  await p.screenshot({ path: SHOT + "/booking-reschedule-fail.png", fullPage: true }).catch(() => {});
}

await browser.close();

// --- 集計 ---
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\nSUMMARY: ${pass}/${results.length} passed`);
if (fail > 0) {
  console.log("FAILED:");
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.detail ?? ""}`);
}
const MIN_CHECKS = 11; // 期待するチェック数(下回る = 途中で飛ばされた)
if (aborted) console.log("ABORTED: 例外で中断したため、以降のチェックは実行されていません");
if (!aborted && results.length < MIN_CHECKS)
  console.log(`INCOMPLETE: チェック数 ${results.length} が期待 ${MIN_CHECKS} を下回っています`);
const allGreen = fail === 0 && !aborted && results.length >= MIN_CHECKS;
console.log(allGreen ? "RESCHEDULE_OK" : "RESCHEDULE_FAILED");
