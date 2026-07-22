// premake E2E: 公開(ゲスト)予約フロー
// @implements v2-20 ゲスト予約 / v2-23 通知(患者+院内) / v2-24 Cron 送信
// 前提: pnpm dev 起動済み + ローカル Supabase seed 投入済み(demo, public_booking_enabled=true, manual)
// 実行: node scripts/e2e-public-booking.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT = process.env.SHOT_DIR ?? (process.env.TMPDIR ?? "/tmp");
const GUEST_EMAIL = "e2e-guest@example.com";
const GUEST_NAME = "E2Eゲスト";
const GUEST_KANA = "イーツーイーゲスト";
const GUEST_PHONE = "090-0000-9999";
const INTERNAL_EMAIL = "info@demo.local"; // seed: clinics.email(院内通知の宛先)

// --- 集計 ---
const results = [];
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

// --- 掃除: 前回実行が残した E2E ゲスト予約と通知を削除(ローカル限定)---
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
  // notifications は bookings 削除で booking_id が null になるだけ(on delete set null)なので先に消す
  for (const id of ids) {
    await rest(`notifications?booking_id=eq.${id}`, { method: "DELETE" });
  }
  // 過去に親削除で孤立した患者通知も掃除(院内=info@demo.local は他予約と共用のため触らない)
  await rest(`notifications?recipient_email=eq.${encodeURIComponent(GUEST_EMAIL)}`, {
    method: "DELETE",
  });
  // bookings 削除で booking_sessions / booking_access_tokens は cascade
  await rest(`bookings?guest_email=eq.${encodeURIComponent(GUEST_EMAIL)}`, { method: "DELETE" });
  step(`掃除: 前回のE2Eゲスト予約を削除: ${ids.length} 件`);
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
let chipHhmm = null; // 台帳チップの JST 開始時刻(承認/キャンセル両フェーズで共用)

try {
  // 1) 予約ページを開き、空き枠のある日(seed の open 枠は翌日・翌々日)を探す
  let slotFound = false;
  let usedDate = null;
  const timeBtns = () =>
    p.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ });
  for (const off of [1, 2, 3]) {
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
  await p.screenshot({ path: SHOT + "/public-booking-slots.png", fullPage: true }).catch(() => {});
  if (!slotFound) throw new Error("空き枠が見つからないため以降を中断");

  // 2) 先頭の空き枠を選択 → 連絡先フォームが出る
  await timeBtns().first().click();
  await p.locator("#g-name").waitFor({ state: "visible", timeout: 10000 });
  const formShown = (await p.locator("#g-name").count()) > 0;
  rec("枠選択で連絡先フォームが表示される", formShown);

  // 3) ゲスト情報入力 → 送信
  await p.fill("#g-name", GUEST_NAME);
  await p.fill("#g-kana", GUEST_KANA);
  await p.fill("#g-phone", GUEST_PHONE);
  await p.fill("#g-email", GUEST_EMAIL);
  step(`ゲスト情報入力: ${GUEST_NAME} / ${GUEST_EMAIL} / ${GUEST_PHONE}`);
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
    if (formErr.length > 0) {
      // 完了画面の注意書き(「※このリンクは大切に保管してください」等)への誤マッチを除外
      if ((await p.getByText("予約を受け付けました").count()) > 0) {
        doneShown = true;
        formErr = [];
      }
      break;
    }
  }
  await p.screenshot({ path: SHOT + "/public-booking-done.png", fullPage: true }).catch(() => {});
  const numShown = (await p.getByText("予約番号").count()) > 0;
  rec(
    "完了画面: 受付文言+予約番号が表示される",
    doneShown && numShown,
    doneShown ? `予約番号表示=${numShown}` : `formErr=${JSON.stringify(formErr.slice(0, 2))}`,
  );

  // 5) DB 検証: bookings に guest 予約(status=requested)が 1 件
  const bk = await rest(
    `bookings?guest_email=eq.${encodeURIComponent(GUEST_EMAIL)}&select=id,booking_no,status,source,guest_name,nominated_member_id`,
  );
  const rows = Array.isArray(bk.json) ? bk.json : [];
  const okBooking = rows.length === 1 && rows[0].status === "requested";
  if (rows[0]) {
    bookingId = rows[0].id;
    bookingNo = rows[0].booking_no;
  }
  rec(
    "DB: guest 予約が requested で存在",
    okBooking,
    `件数=${rows.length} status=${rows[0]?.status} source=${rows[0]?.source} no=${bookingNo}`,
  );
  // BC-NEW-07: このフロー(?member 指定なし=「指定なし」)では nominated_member_id が null になる
  rec(
    "DB: 指定なし予約の nominated_member_id が null【BC-NEW-07】",
    rows[0]?.nominated_member_id === null,
    `nominated_member_id=${rows[0]?.nominated_member_id ?? "null"}`,
  );
  // 画面表示の予約番号と DB が一致(参考)
  if (bookingNo) {
    const shown = (await p.getByText(bookingNo).count()) > 0;
    rec("完了画面の予約番号が DB と一致", shown, `booking_no=${bookingNo}`);
  }

  // 6) DB 検証(最重要 / 台帳 No.18): 患者宛 + 院内宛の 2 通知が queued
  let notifs = [];
  if (bookingId) {
    const nres = await rest(
      `notifications?booking_id=eq.${bookingId}&select=kind,recipient_type,recipient_email,status`,
    );
    notifs = Array.isArray(nres.json) ? nres.json : [];
  }
  const patientNotif = notifs.find(
    (n) => n.kind === "booking_requested" && n.recipient_email === GUEST_EMAIL,
  );
  const internalNotif = notifs.find(
    (n) => n.kind === "booking_created_internal" && n.recipient_email === INTERNAL_EMAIL,
  );
  step(`通知一覧: ${JSON.stringify(notifs)}`);
  rec(
    "DB: 患者宛 booking_requested(queued)が存在",
    !!patientNotif && patientNotif.status === "queued",
    patientNotif
      ? `type=${patientNotif.recipient_type} status=${patientNotif.status}`
      : "見つからない",
  );
  rec(
    "DB: 院内宛 booking_created_internal(queued, info@demo.local)が存在【No.18】",
    !!internalNotif &&
      internalNotif.status === "queued" &&
      internalNotif.recipient_type === "member",
    internalNotif
      ? `to=${internalNotif.recipient_email} type=${internalNotif.recipient_type} status=${internalNotif.status}`
      : "見つからない",
  );

  // 7) cron 実行検証: /api/cron が ok=true を返す
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

  // 8) cron 後: 該当 2 通知が sent になっている
  let sentNotifs = [];
  if (bookingId) {
    // 送信は非同期処理後の update。念のため少し待って再取得
    await p.waitForTimeout(500);
    const nres2 = await rest(
      `notifications?booking_id=eq.${bookingId}&select=kind,recipient_email,status,sent_at`,
    );
    sentNotifs = Array.isArray(nres2.json) ? nres2.json : [];
  }
  const patientSent = sentNotifs.find(
    (n) => n.kind === "booking_requested" && n.recipient_email === GUEST_EMAIL,
  );
  const internalSent = sentNotifs.find(
    (n) => n.kind === "booking_created_internal" && n.recipient_email === INTERNAL_EMAIL,
  );
  step(`cron 後の通知: ${JSON.stringify(sentNotifs)}`);
  rec(
    "cron 後: 患者宛通知が sent",
    patientSent?.status === "sent",
    `status=${patientSent?.status}`,
  );
  rec(
    "cron 後: 院内宛通知が sent",
    internalSent?.status === "sent",
    `status=${internalSent?.status}`,
  );

  // ============================================================
  // 承認フェーズ(NT-NEW-1): manual 承認 requested→confirmed で
  // 患者に booking_confirmed が届くことを検証する。
  // ============================================================
  step("=== 承認フェーズ(NT-NEW-1)===");
  if (!bookingId || !usedDate) {
    rec("承認フェーズ: 前提(bookingId/日付)が揃っている", false, "予約作成が未完了のためスキップ");
  } else {
    // 9) owner でログイン(e2e-booking-create.mjs と同方式)
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p.fill("#email", "owner@demo.local");
    await p.fill("#password", "premake-dev");
    await p.getByRole("button", { name: "ログイン" }).click();
    await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
    rec("承認: owner ログイン成功", !p.url().endsWith("/login"), `url=${p.url().replace(BASE, "")}`);

    // 10) 台帳を予約日へ移動(ledger は ?d=YYYY-MM-DD)
    await p.goto(`${BASE}/demo?d=${usedDate}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);

    // 予約チップの JST 開始時刻を取得(チップ本文に "hh:mm (患者未設定)" が出る)
    const sres = await rest(
      `booking_sessions?booking_id=eq.${bookingId}&select=time_range&order=time_range&limit=1`,
    );
    const trange = Array.isArray(sres.json) && sres.json[0] ? sres.json[0].time_range : null;
    if (trange) {
      const m = trange.match(/^\[?"?([^",]+)"?,/);
      if (m) {
        const startMs = Date.parse(m[1]) + 9 * 3600000;
        const d = new Date(startMs);
        chipHhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      }
    }
    step(`E2E予約の台帳表示時刻(JST)=${chipHhmm}`);

    // ゲスト予約は patient_id=null のため台帳チップは「(患者未設定)」表示。
    // 同時刻の別予約と衝突しないよう hh:mm でも絞り込む。
    let chip = p.locator("button").filter({ hasText: "(患者未設定)" });
    if (chipHhmm) chip = chip.filter({ hasText: chipHhmm });
    const chipCount = await chip.count();
    rec("承認: 台帳に E2E ゲスト予約チップが表示される", chipCount >= 1, `候補=${chipCount} time=${chipHhmm}`);
    await p.screenshot({ path: SHOT + "/public-booking-ledger.png", fullPage: true }).catch(() => {});

    if (chipCount >= 1) {
      // 11) チップを開く → 詳細ドロワー。booking_no 表示をポーリング(固定待ちは flaky)
      await chip.first().click();
      let drawerHasNo = false;
      for (let i = 0; i < 10; i++) {
        await p.waitForTimeout(300);
        if (bookingNo && (await p.getByText(bookingNo).count()) > 0) {
          drawerHasNo = true;
          break;
        }
      }
      rec("承認: 詳細ドロワーが開き予約番号が一致", drawerHasNo, `booking_no=${bookingNo}`);

      // 12) 「確定にする」を押下(requested→confirmed)
      const confirmBtn = p.getByRole("button", { name: "確定にする" });
      const hasConfirm = (await confirmBtn.count()) > 0;
      rec("承認: 「確定にする」操作が存在する", hasConfirm);
      if (hasConfirm) {
        await confirmBtn.first().click();
      }
    }

    // 13) DB: bookings.status='confirmed'(Server Action 完了まで最大 10 秒ポーリング)
    let status2 = null;
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(500);
      const bk2 = await rest(`bookings?id=eq.${bookingId}&select=status`);
      status2 = Array.isArray(bk2.json) && bk2.json[0] ? bk2.json[0].status : null;
      if (status2 === "confirmed") break;
    }
    rec("承認後 DB: 予約が confirmed", status2 === "confirmed", `status=${status2}`);

    // 14) DB(NT-NEW-1 の核心): 患者宛 booking_confirmed が queued で追加
    const nres = await rest(
      `notifications?booking_id=eq.${bookingId}&kind=eq.booking_confirmed&select=kind,recipient_type,recipient_email,status`,
    );
    const confNotifs = Array.isArray(nres.json) ? nres.json : [];
    const confNotif = confNotifs.find((n) => n.recipient_email === GUEST_EMAIL);
    step(`承認後の booking_confirmed 通知: ${JSON.stringify(confNotifs)}`);
    rec(
      "承認後 DB: 患者宛 booking_confirmed(queued)が追加【NT-NEW-1】",
      !!confNotif && confNotif.status === "queued" && confNotif.recipient_type === "patient",
      confNotif
        ? `to=${confNotif.recipient_email} type=${confNotif.recipient_type} status=${confNotif.status}`
        : "見つからない",
    );

    // 15) cron 実行 → booking_confirmed が sent
    let cron2Ok = false;
    let cron2Body = null;
    try {
      const cres = await fetch(`${BASE}/api/cron`);
      cron2Body = await cres.json().catch(() => null);
      cron2Ok = cres.ok && cron2Body?.ok === true;
    } catch (e) {
      cron2Body = { fetchError: String(e).slice(0, 120) };
    }
    step(`承認後 cron 応答: ${JSON.stringify(cron2Body)}`);
    rec("承認後 cron: /api/cron が ok=true", cron2Ok, `body=${JSON.stringify(cron2Body)}`);

    await p.waitForTimeout(500);
    const nres2 = await rest(
      `notifications?booking_id=eq.${bookingId}&kind=eq.booking_confirmed&select=recipient_email,status,sent_at`,
    );
    const confSentRows = Array.isArray(nres2.json) ? nres2.json : [];
    const confSent = confSentRows.find((n) => n.recipient_email === GUEST_EMAIL);
    step(`承認後 cron 後の booking_confirmed: ${JSON.stringify(confSentRows)}`);
    rec("承認後 cron 後: 患者宛 booking_confirmed が sent", confSent?.status === "sent", `status=${confSent?.status}`);
  }

  // ============================================================
  // キャンセルフェーズ(NT-NEW-2): 台帳の詳細ドロワーから確定済み予約を
  // キャンセルし、booking_cancelled 通知が queued→sent になることを検証する。
  // (通知本文の「日時未定」バグは pickNotificationSessions の unit テストで担保)
  // ============================================================
  step("=== キャンセルフェーズ(NT-NEW-2)===");
  if (!bookingId || !usedDate) {
    rec("キャンセルフェーズ: 前提(bookingId/日付)が揃っている", false, "予約作成が未完了のためスキップ");
  } else {
    // 台帳を予約日へ再表示(承認でドロワーが閉じた後の最新状態を取得)
    await p.goto(`${BASE}/demo?d=${usedDate}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);

    // 承認フェーズと同じ絞り込み(患者未設定 + JST 開始時刻)でチップを再取得
    let cchip = p.locator("button").filter({ hasText: "(患者未設定)" });
    if (chipHhmm) cchip = cchip.filter({ hasText: chipHhmm });
    const cchipCount = await cchip.count();
    rec("キャンセル: 台帳に E2E 予約チップが表示される", cchipCount >= 1, `候補=${cchipCount} time=${chipHhmm}`);

    if (cchipCount >= 1) {
      // チップを開く → 詳細ドロワー
      await cchip.first().click();
      await p.waitForTimeout(400);
      const drawerHasNo = bookingNo ? (await p.getByText(bookingNo).count()) > 0 : false;
      rec("キャンセル: 詳細ドロワーが開き予約番号が一致", drawerHasNo, `booking_no=${bookingNo}`);

      // 「予約をキャンセル」ghost → 理由入力フォーム → 「キャンセルを確定」
      const openCancel = p.getByRole("button", { name: "予約をキャンセル" });
      const hasOpenCancel = (await openCancel.count()) > 0;
      rec("キャンセル: 「予約をキャンセル」操作が存在する", hasOpenCancel);
      if (hasOpenCancel) {
        await openCancel.first().click();
        await p.waitForTimeout(200);
        await p.fill('input[name="reason"]', "E2Eテスト");
        await p.getByRole("button", { name: "キャンセルを確定" }).click();
        // 成功時はトースト + ドロワークローズ。revalidate 後に DB を再取得。
        await p.waitForTimeout(1200);
      }
      await p.screenshot({ path: SHOT + "/public-booking-cancel.png", fullPage: true }).catch(() => {});
    }

    // DB: bookings.status='cancelled'
    const bk3 = await rest(`bookings?id=eq.${bookingId}&select=status,cancel_reason`);
    const row3 = Array.isArray(bk3.json) && bk3.json[0] ? bk3.json[0] : null;
    rec("キャンセル後 DB: 予約が cancelled", row3?.status === "cancelled", `status=${row3?.status} reason=${row3?.cancel_reason}`);

    // DB: booking_sessions が全て cancelled(枠が解放されている)
    const sres3 = await rest(`booking_sessions?booking_id=eq.${bookingId}&select=status`);
    const srows3 = Array.isArray(sres3.json) ? sres3.json : [];
    const allCancelled = srows3.length > 0 && srows3.every((s) => s.status === "cancelled");
    rec("キャンセル後 DB: booking_sessions が全て cancelled", allCancelled, `${srows3.map((s) => s.status).join(",")}`);

    // DB(NT-NEW-2 の核心): 患者宛 booking_cancelled が queued で追加
    const cnres = await rest(
      `notifications?booking_id=eq.${bookingId}&kind=eq.booking_cancelled&select=kind,recipient_type,recipient_email,status`,
    );
    const cancelNotifs = Array.isArray(cnres.json) ? cnres.json : [];
    const cancelNotif = cancelNotifs.find((n) => n.recipient_email === GUEST_EMAIL);
    step(`キャンセル後の booking_cancelled 通知: ${JSON.stringify(cancelNotifs)}`);
    rec(
      "キャンセル後 DB: 患者宛 booking_cancelled(queued)が追加【NT-NEW-2】",
      !!cancelNotif && cancelNotif.status === "queued" && cancelNotif.recipient_type === "patient",
      cancelNotif
        ? `to=${cancelNotif.recipient_email} type=${cancelNotif.recipient_type} status=${cancelNotif.status}`
        : "見つからない",
    );

    // cron 実行 → booking_cancelled が sent
    let cron3Ok = false;
    let cron3Body = null;
    try {
      const cres = await fetch(`${BASE}/api/cron`);
      cron3Body = await cres.json().catch(() => null);
      cron3Ok = cres.ok && cron3Body?.ok === true;
    } catch (e) {
      cron3Body = { fetchError: String(e).slice(0, 120) };
    }
    step(`キャンセル後 cron 応答: ${JSON.stringify(cron3Body)}`);
    rec("キャンセル後 cron: /api/cron が ok=true", cron3Ok, `body=${JSON.stringify(cron3Body)}`);

    await p.waitForTimeout(500);
    const cnres2 = await rest(
      `notifications?booking_id=eq.${bookingId}&kind=eq.booking_cancelled&select=recipient_email,status,sent_at`,
    );
    const cancelSentRows = Array.isArray(cnres2.json) ? cnres2.json : [];
    const cancelSent = cancelSentRows.find((n) => n.recipient_email === GUEST_EMAIL);
    step(`キャンセル後 cron 後の booking_cancelled: ${JSON.stringify(cancelSentRows)}`);
    rec("キャンセル後 cron 後: 患者宛 booking_cancelled が sent", cancelSent?.status === "sent", `status=${cancelSent?.status}`);
  }

  console.log("PAGEERRORS:", errs.length, errs.slice(0, 3));
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  await p.screenshot({ path: SHOT + "/public-booking-fail.png", fullPage: true }).catch(() => {});
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
console.log(fail === 0 ? "PUBLIC_BOOKING_OK" : "PUBLIC_BOOKING_FAILED");
