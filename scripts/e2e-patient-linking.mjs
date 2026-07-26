// premake E2E: ゲスト予約の名寄せ(候補提示 → 既存患者へ紐付け / 新規患者として登録)
// @implements v2-16 名寄せ(台帳 No.14)/ v2-04 監査ログ(patient.link_candidates / patient.link)
// 前提: pnpm dev 起動済み + ローカル Supabase seed 投入済み
// 実行: node scripts/e2e-patient-linking.mjs
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SHOT = process.env.SHOT_DIR ?? (process.env.TMPDIR ?? "/tmp");

// seed の demo クリニック固定 ID(supabase/seed.sql)
const CLINIC_ID = "10000000-0000-4000-a000-000000000001";
const SERVICE_ID = "60000000-0000-4000-a000-000000000004"; // アートメイク カウンセリングのみ(30分)
const MEMBER_ID = "20000000-0000-4000-a000-000000000002"; // 鈴木(bookable)
const ROOM_ID = "30000000-0000-4000-a000-000000000001"; // 施術室 1
const HANAKO_ID = "70000000-0000-4000-a000-000000000001"; // seed 患者「山田 花子」

// ケース A: 既存患者(山田 花子)と同じ連絡先で申告したゲスト予約
const A_NAME = "山田 花子";
const A_KANA = "ヤマダ ハナコ";
const A_EMAIL = "hanako@example.com";
const A_PHONE = "090-0000-0001";
const A_TIME = "15:00";
// ケース B: 既存患者に一致しないゲスト予約(新規患者として登録)
const B_NAME = "E2Eリンク新規";
const B_KANA = "イーツーイーリンクシンキ";
const B_EMAIL = "e2e-linking-new@example.com";
const B_PHONE = "090-0000-8888";
const B_TIME = "16:00";

// 掃除の目印(人手で作った予約を誤って消さないため notes に入れる)
const MARKER = "E2E名寄せ(自動生成)";

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

const enc = encodeURIComponent;

// --- 掃除: 前回実行が残した E2E ゲスト予約・通知・新規登録患者を削除(ローカル限定)---
async function cleanupPreviousRuns() {
  if (!SB_URL || !SB_KEY) {
    console.log("ABORT: .env.local から Supabase の URL / service role key を取得できません");
    process.exit(1);
  }
  if (!isLocal) {
    console.log("ABORT: Supabase URL がローカルではありません:", SB_URL);
    process.exit(1);
  }
  // 1) E2E が作ったゲスト予約(notes マーカー付き)
  const found = await rest(`bookings?notes=eq.${enc(MARKER)}&select=id`);
  const ids = Array.isArray(found.json) ? found.json.map((b) => b.id) : [];
  for (const id of ids) {
    // notifications は bookings 削除で booking_id が null になるだけ(on delete set null)なので先に消す
    await rest(`notifications?booking_id=eq.${id}`, { method: "DELETE" });
  }
  await rest(`bookings?notes=eq.${enc(MARKER)}`, { method: "DELETE" });
  // 2) 孤立した通知(念のため。宛先は E2E 専用メールのみ)
  await rest(`notifications?recipient_email=eq.${enc(B_EMAIL)}`, { method: "DELETE" });
  // 3) 「新規患者として登録」で作られた患者(先に紐付く予約を消す)
  const pfound = await rest(`patients?name=eq.${enc(B_NAME)}&clinic_id=eq.${CLINIC_ID}&select=id`);
  const pids = Array.isArray(pfound.json) ? pfound.json.map((r) => r.id) : [];
  for (const pid of pids) {
    await rest(`bookings?patient_id=eq.${pid}`, { method: "DELETE" });
    await rest(`patients?id=eq.${pid}`, { method: "DELETE" });
  }
  step(`掃除: E2Eゲスト予約 ${ids.length} 件 / E2E新規患者 ${pids.length} 件を削除`);
}

// JST カレンダー日付(offsetDays 日後)を yyyy-mm-dd で返す
function jstDate(offsetDays) {
  const jst = new Date(Date.now() + offsetDays * 86400000 + 9 * 3600000);
  return jst.toISOString().slice(0, 10);
}
// JST の yyyy-mm-dd + hh:mm を UTC ISO に変換
function jstToUtcISO(date, hhmm) {
  return new Date(`${date}T${hhmm}:00+09:00`).toISOString();
}
// hh:mm から 30 分後の hh:mm
function plus30(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + 30;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * ゲスト予約(patient_id = null + guest_* 保持)を REST で直接作る。
 * 公開予約フローは e2e-public-booking.mjs が担保済みなので、ここでは名寄せの入力状態だけを作る。
 */
async function insertGuestBooking({ date, time, name, kana, email, phone }) {
  const startISO = jstToUtcISO(date, time);
  const endISO = jstToUtcISO(date, plus30(time));
  const bres = await rest("bookings?select=id,booking_no", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      clinic_id: CLINIC_ID,
      patient_id: null,
      service_id: SERVICE_ID,
      status: "requested",
      source: "web",
      guest_name: name,
      guest_kana: kana,
      guest_email: email,
      guest_phone: phone,
      notes: MARKER,
    }),
  });
  const row = Array.isArray(bres.json) ? bres.json[0] : null;
  if (!row) return { error: `bookings insert 失敗 status=${bres.status} ${bres.text.slice(0, 160)}` };
  const range = `["${startISO}","${endISO}")`;
  const sres = await rest("booking_sessions", {
    method: "POST",
    body: JSON.stringify({
      clinic_id: CLINIC_ID,
      booking_id: row.id,
      seq: 1,
      kind: "counseling",
      label: "カウンセリング・医師診察",
      member_id: MEMBER_ID,
      room_id: ROOM_ID,
      time_range: range,
      occupied_range: range,
    }),
  });
  if (!sres.ok) {
    return {
      error: `booking_sessions insert 失敗 status=${sres.status} ${sres.text.slice(0, 160)}`,
      id: row.id,
    };
  }
  return { id: row.id, bookingNo: row.booking_no };
}

await cleanupPreviousRuns();

const browser = await chromium.launch();
const ctx = await browser.newContext();
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));

// 条件が満たされるまで待つ(固定待ちは flaky)
async function poll(fn, tries = 24, interval = 500) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await p.waitForTimeout(interval);
  }
  return null;
}

/**
 * 紐付け成功の UI 判定。
 * 実装は成功時に toast「患者に紐付けました」+ ダイアログ/ドロワーを閉じて refresh するが、
 * sonner の `<Toaster />`(src/components/ui/sonner.tsx)がどのレイアウトにもマウントされていない
 * ため、トーストは DOM に現れない(名寄せ固有ではなくアプリ全体の既知の欠落)。
 * ここではトーストがあればそれを、無ければ「操作ボタンが消える = 閉じた」を成功シグナルとする。
 */
async function linkCompleted(actionBtn) {
  return await poll(async () => {
    if ((await p.getByText("患者に紐付けました").count()) > 0) return "toast";
    if ((await actionBtn.count()) === 0) return "dialog-closed";
    return null;
  });
}

async function auditActions(bookingId) {
  const res = await rest(
    `audit_logs?target_id=eq.${bookingId}&target_type=eq.booking&select=action,actor_type,diff&order=created_at`,
  );
  return Array.isArray(res.json) ? res.json : [];
}

// 台帳のゲスト予約チップ(patient_id=null は "hh:mm (患者未設定)" 表示)
function guestChip(hhmm) {
  return p.locator("button").filter({ hasText: "(患者未設定)" }).filter({ hasText: hhmm });
}

// seed 枠(翌日・翌々日)や他 E2E と衝突しない将来日を使う
const day = jstDate(8);
let caseA = null;
let caseB = null;

try {
  // 0) 前提データ: ゲスト予約 2 件を作る
  caseA = await insertGuestBooking({
    date: day,
    time: A_TIME,
    name: A_NAME,
    kana: A_KANA,
    email: A_EMAIL,
    phone: A_PHONE,
  });
  caseB = await insertGuestBooking({
    date: day,
    time: B_TIME,
    name: B_NAME,
    kana: B_KANA,
    email: B_EMAIL,
    phone: B_PHONE,
  });
  step(`前提ゲスト予約: ${day} ${A_TIME}=${caseA.bookingNo} / ${B_TIME}=${caseB.bookingNo}`);
  rec(
    "前提: ゲスト予約 2 件(patient_id=null)を作成",
    !!caseA.id && !!caseB.id && !caseA.error && !caseB.error,
    caseA.error ?? caseB.error ?? `A=${caseA.bookingNo} B=${caseB.bookingNo}`,
  );
  if (caseA.error || caseB.error) throw new Error("前提データ作成に失敗したため中断");

  // 1) owner ログイン
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("#email", "owner@demo.local");
  await p.fill("#password", "premake-dev");
  await p.getByRole("button", { name: "ログイン" }).click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  rec("owner ログイン成功", !p.url().endsWith("/login"), `url=${p.url().replace(BASE, "")}`);

  // ============================================================
  // ケース A: 既存患者(山田 花子)へ紐付け
  // ============================================================
  step("=== ケース A: 既存患者への紐付け ===");
  await p.goto(`${BASE}/demo?d=${day}`, { waitUntil: "networkidle" });
  const chipA = await poll(async () => ((await guestChip(A_TIME).count()) > 0 ? true : null));
  rec("A: 台帳にゲスト予約チップが表示される", !!chipA, `time=${A_TIME} date=${day}`);
  if (!chipA) throw new Error("ケース A のチップが見つからないため中断");

  await guestChip(A_TIME).first().click();
  const drawerA = await poll(async () =>
    caseA.bookingNo && (await p.getByText(caseA.bookingNo).count()) > 0 ? true : null,
  );
  rec("A: 詳細ドロワーが開き予約番号が一致", !!drawerA, `booking_no=${caseA.bookingNo}`);

  const linkBtn = p.getByRole("button", { name: "患者に紐付け", exact: true });
  const hasLinkBtn = (await linkBtn.count()) > 0;
  rec("A: ドロワーに「患者に紐付け」ボタンが存在する", hasLinkBtn);
  if (!hasLinkBtn) throw new Error("紐付けボタンが無いため中断");
  await linkBtn.first().click();

  // ダイアログ: タイトルと候補の到着を待つ
  const dialogA = await poll(async () =>
    (await p.getByRole("heading", { name: "患者に紐付け", exact: true }).count()) > 0 ? true : null,
  );
  rec("A: ダイアログ「患者に紐付け」が開く", !!dialogA);
  const candBtn = p.getByRole("button", { name: `${A_NAME} に紐付け`, exact: true });
  const candShown = await poll(async () => ((await candBtn.count()) > 0 ? true : null));
  const badgeShown = (await p.getByText("メール一致", { exact: true }).count()) > 0;
  const guestBlock = (await p.getByText("予約時の申告内容").count()) > 0;
  await p.screenshot({ path: SHOT + "/patient-linking-candidates.png", fullPage: true }).catch(() => {});
  rec("A: 候補に既存患者「山田 花子」が提示される", !!candShown, `候補ボタン=${await candBtn.count()}`);
  rec("A: 一致理由バッジ「メール一致」が表示される", badgeShown);
  rec("A: 予約時の申告内容(guest_*)が確認できる", guestBlock);
  if (!candShown) throw new Error("候補が提示されないため中断");

  // 「この患者に紐付け」を実行
  await candBtn.first().click();
  const doneA = await linkCompleted(candBtn);
  rec("A: 紐付けが完了する(ダイアログが閉じる / トースト)", !!doneA, `signal=${doneA}`);

  const linkedA = await poll(async () => {
    const res = await rest(
      `bookings?id=eq.${caseA.id}&select=patient_id,guest_name,guest_email,guest_phone,status`,
    );
    const row = Array.isArray(res.json) ? res.json[0] : null;
    return row?.patient_id ? row : null;
  });
  rec(
    "A: DB の bookings.patient_id が山田 花子(seed ID)になる",
    linkedA?.patient_id === HANAKO_ID,
    `patient_id=${linkedA?.patient_id ?? "null"}`,
  );
  rec(
    "A: guest_*(予約時の申告内容)は履歴として残る",
    linkedA?.guest_name === A_NAME && linkedA?.guest_email === A_EMAIL,
    `guest_name=${linkedA?.guest_name} guest_email=${linkedA?.guest_email}`,
  );
  rec(
    "A: 紐付けでステータスは変わらない(requested のまま)",
    linkedA?.status === "requested",
    `status=${linkedA?.status}`,
  );

  const auditA = await poll(async () => {
    const rows = await auditActions(caseA.id);
    return rows.some((r) => r.action === "patient.link") ? rows : null;
  });
  const aCand = (auditA ?? []).find((r) => r.action === "patient.link_candidates");
  const aLink = (auditA ?? []).find((r) => r.action === "patient.link");
  step(`A: audit_logs=${JSON.stringify(auditA ?? [])}`);
  rec(
    "A: 監査 patient.link_candidates(候補閲覧)が記録される",
    !!aCand && aCand.actor_type === "member",
    aCand ? `diff=${JSON.stringify(aCand.diff)}` : "見つからない",
  );
  rec(
    "A: 監査 patient.link(mode=existing / patient_id)が記録される",
    !!aLink && aLink.diff?.mode === "existing" && aLink.diff?.patient_id === HANAKO_ID,
    aLink ? `diff=${JSON.stringify(aLink.diff)}` : "見つからない",
  );

  // 台帳チップが患者名表示に変わる(自動リフレッシュ)
  const chipRenamed = await poll(async () => {
    const n = await p
      .locator("button")
      .filter({ hasText: A_TIME })
      .filter({ hasText: A_NAME })
      .count();
    return n > 0 ? true : null;
  }, 20);
  rec("A: 台帳チップが患者名表示に変わる", !!chipRenamed, `time=${A_TIME} name=${A_NAME}`);

  // ============================================================
  // ケース B: 新規患者として登録
  // ============================================================
  step("=== ケース B: 新規患者として登録 ===");
  await p.goto(`${BASE}/demo?d=${day}`, { waitUntil: "networkidle" });
  const chipB = await poll(async () => ((await guestChip(B_TIME).count()) > 0 ? true : null));
  rec("B: 台帳にゲスト予約チップが表示される", !!chipB, `time=${B_TIME} date=${day}`);
  if (!chipB) throw new Error("ケース B のチップが見つからないため中断");

  await guestChip(B_TIME).first().click();
  const drawerB = await poll(async () =>
    caseB.bookingNo && (await p.getByText(caseB.bookingNo).count()) > 0 ? true : null,
  );
  rec("B: 詳細ドロワーが開き予約番号が一致", !!drawerB, `booking_no=${caseB.bookingNo}`);

  const linkBtnB = p.getByRole("button", { name: "患者に紐付け", exact: true });
  const hasLinkBtnB = (await linkBtnB.count()) > 0;
  rec("B: ドロワーに「患者に紐付け」ボタンが存在する", hasLinkBtnB);
  if (!hasLinkBtnB) throw new Error("紐付けボタンが無いため中断");
  await linkBtnB.first().click();

  const newBtn = p.getByRole("button", { name: "新規患者として登録", exact: true });
  const noneShown = await poll(async () =>
    (await p.getByText("一致する既存患者の候補はありません").count()) > 0 ? true : null,
  );
  const hasNewBtn = (await newBtn.count()) > 0;
  await p.screenshot({ path: SHOT + "/patient-linking-new.png", fullPage: true }).catch(() => {});
  rec("B: 候補 0 件のメッセージが表示される", !!noneShown);
  rec("B: 候補 0 件でも「新規患者として登録」が選べる", hasNewBtn);
  if (!hasNewBtn) throw new Error("新規登録ボタンが無いため中断");

  await newBtn.first().click();
  const doneB = await linkCompleted(newBtn);
  rec("B: 紐付けが完了する(ダイアログが閉じる / トースト)", !!doneB, `signal=${doneB}`);

  const linkedB = await poll(async () => {
    const res = await rest(
      `bookings?id=eq.${caseB.id}&select=patient_id,guest_name,guest_email`,
    );
    const row = Array.isArray(res.json) ? res.json[0] : null;
    return row?.patient_id ? row : null;
  });
  rec(
    "B: DB の bookings.patient_id がセットされる",
    !!linkedB?.patient_id,
    `patient_id=${linkedB?.patient_id ?? "null"}`,
  );
  rec(
    "B: guest_* は履歴として残る",
    linkedB?.guest_name === B_NAME && linkedB?.guest_email === B_EMAIL,
    `guest_name=${linkedB?.guest_name}`,
  );

  let newPatient = null;
  if (linkedB?.patient_id) {
    const pres = await rest(
      `patients?id=eq.${linkedB.patient_id}&select=clinic_id,name,kana,phone,email`,
    );
    newPatient = Array.isArray(pres.json) ? pres.json[0] : null;
  }
  step(`B: 作成された患者=${JSON.stringify(newPatient)}`);
  rec(
    "B: guest_* の申告内容で患者が新規作成される",
    newPatient?.name === B_NAME &&
      newPatient?.kana === B_KANA &&
      newPatient?.phone === B_PHONE &&
      newPatient?.email === B_EMAIL &&
      newPatient?.clinic_id === CLINIC_ID,
    newPatient ? `name=${newPatient.name} email=${newPatient.email}` : "見つからない",
  );

  const auditB = await poll(async () => {
    const rows = await auditActions(caseB.id);
    return rows.some((r) => r.action === "patient.link") ? rows : null;
  });
  const bCand = (auditB ?? []).find((r) => r.action === "patient.link_candidates");
  const bLink = (auditB ?? []).find((r) => r.action === "patient.link");
  step(`B: audit_logs=${JSON.stringify(auditB ?? [])}`);
  rec(
    "B: 監査 patient.link_candidates(hits=0)が記録される",
    !!bCand && bCand.diff?.hits === 0,
    bCand ? `diff=${JSON.stringify(bCand.diff)}` : "見つからない",
  );
  rec(
    "B: 監査 patient.link(mode=new)が記録される",
    !!bLink && bLink.diff?.mode === "new" && bLink.diff?.patient_id === linkedB?.patient_id,
    bLink ? `diff=${JSON.stringify(bLink.diff)}` : "見つからない",
  );

  // 紐付け済み予約は再度紐付けできない(canLink = patient_id null かつ guest_name あり)
  await p.goto(`${BASE}/demo?d=${day}`, { waitUntil: "networkidle" });
  const chipDone = await poll(async () => {
    const n = await p
      .locator("button")
      .filter({ hasText: B_TIME })
      .filter({ hasText: B_NAME })
      .count();
    return n > 0 ? true : null;
  }, 20);
  rec("B: 台帳チップが新規患者名表示に変わる", !!chipDone, `time=${B_TIME} name=${B_NAME}`);
  if (chipDone) {
    await p.locator("button").filter({ hasText: B_TIME }).filter({ hasText: B_NAME }).first().click();
    await poll(async () =>
      caseB.bookingNo && (await p.getByText(caseB.bookingNo).count()) > 0 ? true : null,
    );
    const stillLinkable = await p
      .getByRole("button", { name: "患者に紐付け", exact: true })
      .count();
    rec("B: 紐付け済み予約のドロワーに紐付け導線が出ない", stillLinkable === 0, `count=${stillLinkable}`);
  }

  console.log("PAGEERRORS:", errs.length, errs.slice(0, 3));
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  aborted = true;
  await p.screenshot({ path: SHOT + "/patient-linking-fail.png", fullPage: true }).catch(() => {});
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
const MIN_CHECKS = 29; // 期待するチェック数(下回る = 途中で飛ばされた)
if (aborted) console.log("ABORTED: 例外で中断したため、以降のチェックは実行されていません");
if (!aborted && results.length < MIN_CHECKS)
  console.log(`INCOMPLETE: チェック数 ${results.length} が期待 ${MIN_CHECKS} を下回っています`);
const allGreen = fail === 0 && !aborted && results.length >= MIN_CHECKS;
console.log(allGreen ? "LINKING_OK" : "LINKING_FAILED");
process.exit(allGreen ? 0 : 1);
