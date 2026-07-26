// premake E2E: 患者セルフキャンセル(manage トークン)+ 通知(患者+院内)+ Cron 送信
// @implements v2-21 患者側キャンセル / v2-23 キャンセル通知(No.22) / v2-24 Cron 送信
// 前提: pnpm dev 起動済み + ローカル Supabase seed 投入済み(demo, public_booking_enabled=true, manual)
// 実行: node scripts/e2e-self-cancel.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT = process.env.SHOT_DIR ?? (process.env.TMPDIR ?? "/tmp");
const GUEST_EMAIL = "e2e-selfcancel@example.com";
const GUEST_NAME = "E2Eセルフキャンセル";
const GUEST_KANA = "イーツーイーセルフキャンセル";
const GUEST_PHONE = "090-0000-8888";
const INTERNAL_EMAIL = "info@demo.local"; // seed: clinics.email(院内通知の宛先)

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

// --- .env.local(他 E2E と同方式)---
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

// --- 掃除: 前回実行が残した専用ゲスト予約と通知を削除(ローカル限定)---
async function cleanupPreviousRuns() {
  if (!SB_URL || !SB_KEY) {
    step("掃除: env 未取得のためスキップ");
    return;
  }
  if (!isLocal) {
    console.log("ABORT: Supabase URL がローカルではありません:", SB_URL);
    process.exit(1);
  }
  const found = await rest(`bookings?guest_email=eq.${encodeURIComponent(GUEST_EMAIL)}&select=id`);
  const ids = Array.isArray(found.json) ? found.json.map((b) => b.id) : [];
  // 院内(info@demo.local)通知も含め、この予約に紐づく通知は booking_id 単位で先に消す
  for (const id of ids) {
    await rest(`notifications?booking_id=eq.${id}`, { method: "DELETE" });
  }
  // 親削除で孤立した患者通知の掃除(院内=info@demo.local は他予約と共用のため触らない)
  await rest(`notifications?recipient_email=eq.${encodeURIComponent(GUEST_EMAIL)}`, {
    method: "DELETE",
  });
  // bookings 削除で booking_sessions / booking_access_tokens は cascade
  await rest(`bookings?guest_email=eq.${encodeURIComponent(GUEST_EMAIL)}`, { method: "DELETE" });
  step(`掃除: 前回の専用ゲスト予約を削除: ${ids.length} 件`);
}

// JST カレンダー日付(offsetDays 日後)を yyyy-mm-dd で返す
function jstDate(offsetDays) {
  const jst = new Date(Date.now() + offsetDays * 86400000 + 9 * 3600000);
  return jst.toISOString().slice(0, 10);
}

await cleanupPreviousRuns();

const browser = await chromium.launch();
const ctx = await browser.newContext();
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));

let bookingId = null;
let bookingNo = null;

try {
  // 1) 予約ページを開き、空き枠のある日を探す。
  //    セルフキャンセルはキャンセル期限(既定 24h 前)チェックがあるため、+2 日(翌々日)を
  //    優先し、24h 以上先の枠を確実に取る。
  let slotFound = false;
  let usedDate = null;
  const timeBtns = () => p.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ });
  for (const off of [2, 3, 1]) {
    const d = jstDate(off);
    await p.goto(`${BASE}/c/demo/reserve?date=${d}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(300);
    const n = await timeBtns().count();
    step(`予約ページ date=${d} url=${p.url().replace(BASE, "")} 空き枠=${n}`);
    if (n > 0) {
      usedDate = d;
      slotFound = true;
      break;
    }
  }
  rec("予約ページに空き枠が表示される", slotFound, slotFound ? `date=${usedDate}` : "全日空き枠なし");
  if (!slotFound) throw new Error("空き枠が見つからないため以降を中断");

  // 2) 先頭の空き枠を選択 → 連絡先フォーム
  await timeBtns().first().click();
  await p.locator("#g-name").waitFor({ state: "visible", timeout: 10000 });
  rec("枠選択で連絡先フォームが表示される", (await p.locator("#g-name").count()) > 0);

  // 3) ゲスト情報入力 → 送信
  await p.fill("#g-name", GUEST_NAME);
  await p.fill("#g-kana", GUEST_KANA);
  await p.fill("#g-phone", GUEST_PHONE);
  await p.fill("#g-email", GUEST_EMAIL);
  step(`ゲスト情報入力: ${GUEST_NAME} / ${GUEST_EMAIL}`);
  await p.getByRole("button", { name: "この内容で予約する" }).click();

  // 4) 完了画面(manual → 「予約を受け付けました」)を待つ
  let doneShown = false;
  let formErr = [];
  for (let i = 0; i < 24; i++) {
    await p.waitForTimeout(500);
    if ((await p.getByText("予約を受け付けました").count()) > 0) {
      doneShown = true;
      break;
    }
    formErr = await p.getByText(/ください|正しくありません|できません|失敗|エラー/).allTextContents();
    if (formErr.length > 0) break;
  }
  await p.screenshot({ path: SHOT + "/self-cancel-done.png", fullPage: true }).catch(() => {});
  rec(
    "完了画面: 受付文言が表示される",
    doneShown,
    doneShown ? "" : `formErr=${JSON.stringify(formErr.slice(0, 2))}`,
  );

  // 5) DB 検証: 専用ゲスト予約が requested で 1 件
  const bk = await rest(
    `bookings?guest_email=eq.${encodeURIComponent(GUEST_EMAIL)}&select=id,booking_no,status`,
  );
  const rows = Array.isArray(bk.json) ? bk.json : [];
  if (rows[0]) {
    bookingId = rows[0].id;
    bookingNo = rows[0].booking_no;
  }
  rec(
    "DB: guest 予約が requested で存在",
    rows.length === 1 && rows[0]?.status === "requested",
    `件数=${rows.length} status=${rows[0]?.status} no=${bookingNo}`,
  );

  // 6) 完了画面の管理リンク「予約内容を確認する」の href(manage トークン)を UI から取得し遷移。
  //    ソフトナビゲーションの race を避けるため href を読んで直接 goto する。
  const manageLink = p.getByRole("link", { name: "予約内容を確認する" });
  const hasManageLink = (await manageLink.count()) > 0;
  rec("完了画面に管理リンク(予約内容を確認する)が表示される", hasManageLink);
  if (!hasManageLink) throw new Error("管理リンクが無いため以降を中断");
  const manageHref = await manageLink.first().getAttribute("href");
  const okHref = !!manageHref && manageHref.includes("/manage/");
  rec("管理リンクの href が manage トークンを指す", okHref, `href=${manageHref}`);
  if (!okHref) throw new Error("管理リンクの href が不正のため以降を中断");
  await p.goto(`${BASE}${manageHref}`, { waitUntil: "networkidle" });
  step(`manage ページ url=${p.url().replace(BASE, "")}`);

  // manage ページに予約番号が出る(トークン照会が成立している)
  const manageHasNo = bookingNo ? (await p.getByText(bookingNo).count()) > 0 : false;
  rec("manage ページが開き予約番号が一致", manageHasNo, `booking_no=${bookingNo}`);

  // 7) キャンセル操作: 「予約をキャンセル」→ 確認 → 「キャンセルする」
  const openCancel = p.getByRole("button", { name: "予約をキャンセル" });
  const hasOpenCancel = (await openCancel.count()) > 0;
  rec("manage: 「予約をキャンセル」操作が存在する", hasOpenCancel);
  if (hasOpenCancel) {
    await openCancel.first().click();
    await p.waitForTimeout(200);
    await p.getByRole("button", { name: "キャンセルする" }).click();
    // 成功時はトースト + キャンセル済み表示に切替。少し待って DB を再取得。
    await p.waitForTimeout(1200);
  }
  await p.screenshot({ path: SHOT + "/self-cancel-after.png", fullPage: true }).catch(() => {});

  const cancelledMsg = (await p.getByText("この予約はキャンセルされました").count()) > 0;
  rec("manage: キャンセル完了表示に切り替わる", cancelledMsg);

  // 8) DB: bookings.status='cancelled'
  const bk2 = await rest(`bookings?id=eq.${bookingId}&select=status`);
  const status2 = Array.isArray(bk2.json) && bk2.json[0] ? bk2.json[0].status : null;
  rec("キャンセル後 DB: 予約が cancelled", status2 === "cancelled", `status=${status2}`);

  // 9) DB: booking_sessions が全て cancelled(枠が解放されている)
  const sres = await rest(`booking_sessions?booking_id=eq.${bookingId}&select=status`);
  const srows = Array.isArray(sres.json) ? sres.json : [];
  const allCancelled = srows.length > 0 && srows.every((s) => s.status === "cancelled");
  rec("キャンセル後 DB: booking_sessions が全て cancelled", allCancelled, srows.map((s) => s.status).join(","));

  // 10) DB(No.22 の核心): 患者宛 booking_cancelled + 院内宛 booking_cancelled_internal が queued
  const nres = await rest(
    `notifications?booking_id=eq.${bookingId}&select=kind,recipient_type,recipient_email,status`,
  );
  const notifs = Array.isArray(nres.json) ? nres.json : [];
  step(`キャンセル後の通知一覧: ${JSON.stringify(notifs)}`);
  const patientNotif = notifs.find(
    (n) => n.kind === "booking_cancelled" && n.recipient_email === GUEST_EMAIL,
  );
  const internalNotif = notifs.find(
    (n) => n.kind === "booking_cancelled_internal" && n.recipient_email === INTERNAL_EMAIL,
  );
  rec(
    "DB: 患者宛 booking_cancelled(queued)が存在【No.22】",
    !!patientNotif && patientNotif.status === "queued" && patientNotif.recipient_type === "patient",
    patientNotif ? `type=${patientNotif.recipient_type} status=${patientNotif.status}` : "見つからない",
  );
  rec(
    "DB: 院内宛 booking_cancelled_internal(queued, info@demo.local)が存在【No.22】",
    !!internalNotif && internalNotif.status === "queued" && internalNotif.recipient_type === "member",
    internalNotif
      ? `to=${internalNotif.recipient_email} type=${internalNotif.recipient_type} status=${internalNotif.status}`
      : "見つからない",
  );

  // 11) cron 実行 → ok=true
  let cronOk = false;
  let cronBody = null;
  try {
    const cres = await fetch(`${BASE}/api/cron`);
    cronBody = await cres.json().catch(() => null);
    cronOk = cres.ok && cronBody?.ok === true;
  } catch (e) {
    cronBody = { fetchError: String(e).slice(0, 120) };
  }
  step(`cron 応答: ${JSON.stringify(cronBody)}`);
  rec("cron: /api/cron が ok=true", cronOk, `body=${JSON.stringify(cronBody)}`);

  // 12) cron 後: 両通知が sent
  await p.waitForTimeout(500);
  const nres2 = await rest(
    `notifications?booking_id=eq.${bookingId}&select=kind,recipient_email,status,sent_at`,
  );
  const sentNotifs = Array.isArray(nres2.json) ? nres2.json : [];
  step(`cron 後の通知: ${JSON.stringify(sentNotifs)}`);
  const patientSent = sentNotifs.find(
    (n) => n.kind === "booking_cancelled" && n.recipient_email === GUEST_EMAIL,
  );
  const internalSent = sentNotifs.find(
    (n) => n.kind === "booking_cancelled_internal" && n.recipient_email === INTERNAL_EMAIL,
  );
  rec("cron 後: 患者宛 booking_cancelled が sent", patientSent?.status === "sent", `status=${patientSent?.status}`);
  rec("cron 後: 院内宛 booking_cancelled_internal が sent", internalSent?.status === "sent", `status=${internalSent?.status}`);

  console.log("PAGEERRORS:", errs.length, errs.slice(0, 3));
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  aborted = true;
  await p.screenshot({ path: SHOT + "/self-cancel-fail.png", fullPage: true }).catch(() => {});
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
const MIN_CHECKS = 16; // 期待するチェック数(下回る = 途中で飛ばされた)
if (aborted) console.log("ABORTED: 例外で中断したため、以降のチェックは実行されていません");
if (!aborted && results.length < MIN_CHECKS)
  console.log(`INCOMPLETE: チェック数 ${results.length} が期待 ${MIN_CHECKS} を下回っています`);
const allGreen = fail === 0 && !aborted && results.length >= MIN_CHECKS;
console.log(allGreen ? "SELF_CANCEL_OK" : "SELF_CANCEL_FAILED");
process.exit(allGreen ? 0 : 1);
