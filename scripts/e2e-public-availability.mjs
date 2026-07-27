// premake E2E: 公開予約の空き枠・指名の整合性(★3-c)
// @implements v2-06 空き枠 / v2-07 担当可否(No.9 / No.34 / BC-NEW-02)/ v2-22 指名(F8)
// 前提: pnpm dev 起動済み + ローカル Supabase seed 投入済み(demo, public_booking_enabled=true)
// 実行: node scripts/e2e-public-availability.mjs
//
// 方式: service role でテストスタッフ(display_name=null / is_bookable=false / active)と翌々日 open 枠を
//       作成し、公開予約ページ(SSR HTML)に枠・指名チップが出る/出ないを検証。DB 直で状態を切り替える
//       対照実験を行い、finally で作成物(枠・担当割当・member・auth ユーザー)を必ず削除する。
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";

// --- 定数(seed のデモ環境)---
const CLINIC = "10000000-0000-4000-a000-000000000001";
const ROOM2 = "30000000-0000-4000-a000-000000000002"; // 施術室 2(翌々日は seed 枠と非重複)
const SVC = "60000000-0000-4000-a000-000000000003"; // アートメイク リタッチ(allow_nomination=true, 90+15min)
const SUZUKI = "20000000-0000-4000-a000-000000000002"; // 鈴木(staff, is_bookable=true)
const TANAKA = "20000000-0000-4000-a000-000000000003"; // 田中(staff, is_bookable=true)
const AVAIL_EMAIL = "e2e-avail@example.com";
const FULLNAME = "E2E本名露出テスト"; // profiles.full_name。公開文脈で漏れてはいけない本名

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

// --- .env.local(既存 e2e スクリプトと同方式)---
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

if (!SB_URL || !SB_KEY) {
  console.log("ABORT: .env.local から Supabase URL / service role key を取得できません");
  process.exit(1);
}
if (!isLocal) {
  console.log("ABORT: Supabase URL がローカルではありません(破壊的操作を伴うため中断):", SB_URL);
  process.exit(1);
}

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
    /* non-json(DELETE 等) */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function adminAuth(path, init) {
  const res = await fetch(`${SB_URL}/auth/v1/${path}`, {
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

// JST カレンダー日付(offsetDays 日後)を yyyy-mm-dd で返す
function jstDate(offsetDays) {
  const jst = new Date(Date.now() + offsetDays * 86400000 + 9 * 3600000);
  return jst.toISOString().slice(0, 10);
}

// 公開予約ページ(SSR)を取得。空き枠/指名チップは初期 HTML に含まれる。
async function fetchReserve(params) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/c/demo/reserve?${q}`, { cache: "no-store" });
  return { status: res.status, html: await res.text() };
}
// slots.length===0 のとき ReserveFlow はこの文言を出す(枠ありなら出さない)
function isEmpty(html) {
  return html.includes("この日は空きがありません");
}
// SSR HTML に含まれる時間チップ(hh:mm)の件数。日付表示は m/d(曜) 形式で hh:mm は枠のみ。
function timeChipCount(html) {
  return (html.match(/>\s*\d{1,2}:\d{2}\s*</g) ?? []).length;
}

async function findAuthUserByEmail(email) {
  const res = await adminAuth("admin/users?per_page=1000", {});
  const users = res.json?.users ?? [];
  return users.find((u) => u.email === email) ?? null;
}

// 指定 user に紐づく demo の member と、その枠・担当割当を削除
async function cleanupMemberByUserId(userId) {
  const cm = await rest(
    `clinic_members?user_id=eq.${userId}&clinic_id=eq.${CLINIC}&select=id`,
  );
  const ids = Array.isArray(cm.json) ? cm.json.map((m) => m.id) : [];
  for (const id of ids) {
    await rest(`schedule_blocks?member_id=eq.${id}`, { method: "DELETE" });
    await rest(`staff_service_assignments?member_id=eq.${id}`, { method: "DELETE" });
    await rest(`clinic_members?id=eq.${id}`, { method: "DELETE" });
  }
}

// 指定 member の状態を切り替えるヘルパー
let memberId = null;
async function setMember(fields) {
  await rest(`clinic_members?id=eq.${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}
async function addAssignment() {
  await rest("staff_service_assignments", {
    method: "POST",
    body: JSON.stringify({ clinic_id: CLINIC, member_id: memberId, service_id: SVC }),
  });
}
async function delAssignment() {
  await rest(
    `staff_service_assignments?member_id=eq.${memberId}&service_id=eq.${SVC}`,
    { method: "DELETE" },
  );
}

// 指定 member の「将来の open 枠」の JST 日付一覧(重複排除)。回帰テストで seed 鮮度・
// 既存予約による枠埋まりに依存しないよう、複数日を候補にする。
async function futureBlockDates(mid) {
  const res = await rest(
    `schedule_blocks?clinic_id=eq.${CLINIC}&member_id=eq.${mid}&block_type=eq.open&select=time_range&order=time_range`,
  );
  const rows = Array.isArray(res.json) ? res.json : [];
  const dates = [];
  for (const b of rows) {
    const m = String(b.time_range).match(/^\[?"?([^",]+)"?,/);
    if (!m) continue;
    const start = Date.parse(m[1]);
    if (start > Date.now()) {
      const d = new Date(start + 9 * 3600000).toISOString().slice(0, 10);
      if (!dates.includes(d)) dates.push(d);
    }
  }
  return dates;
}

// 将来枠のいずれかの日で空き枠が出れば OK(既存予約で満床の日があっても回帰は成立)
async function anyDateHasSlots(mid, dates) {
  let last = { date: null, empty: true, chips: 0 };
  for (const date of dates) {
    const { html } = await fetchReserve({ service: SVC, date, member: mid });
    last = { date, empty: isEmpty(html), chips: timeChipCount(html) };
    if (!last.empty && last.chips > 0) return last;
  }
  return last;
}

const date2 = jstDate(2); // 翌々日
let userId = null;

// --- 事前掃除(前回実行の残骸)---
step("事前掃除: 既存の e2e-avail ユーザーを探索");
const prev = await findAuthUserByEmail(AVAIL_EMAIL);
if (prev) {
  await cleanupMemberByUserId(prev.id);
  await adminAuth(`admin/users/${prev.id}`, { method: "DELETE" });
  step(`事前掃除: 前回の auth ユーザー(${prev.id})と紐づく member/枠を削除`);
}

try {
  // ============================================================
  // setup
  // ============================================================
  step("setup: auth ユーザー作成(full_name=本名, display_name は後で null 設定)");
  const created = await adminAuth("admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: AVAIL_EMAIL,
      password: "premake-dev",
      email_confirm: true,
      user_metadata: { full_name: FULLNAME },
    }),
  });
  userId = created.json?.id ?? created.json?.user?.id ?? null;
  if (!userId) {
    rec("setup: auth ユーザー作成", false, `status=${created.status} body=${created.text.slice(0, 200)}`);
    throw new Error("auth ユーザー作成に失敗");
  }
  rec("setup: auth ユーザー作成", true, `id=${userId}`);

  // profiles.full_name がトリガーで本名設定されたか確認(F8 の前提)
  const prof = await rest(`profiles?id=eq.${userId}&select=full_name`);
  const fullNameSet = Array.isArray(prof.json) && prof.json[0]?.full_name === FULLNAME;
  rec("setup: profiles.full_name=本名 が設定される", fullNameSet, `full_name=${prof.json?.[0]?.full_name}`);

  step("setup: clinic_members 作成(roles={staff}, display_name=null, is_bookable=false, active)");
  const cmIns = await rest("clinic_members", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      clinic_id: CLINIC,
      user_id: userId,
      roles: ["staff"],
      employment_type: "employed",
      display_name: null,
      is_bookable: false,
      status: "active",
    }),
  });
  memberId = cmIns.json?.[0]?.id ?? null;
  if (!memberId) {
    rec("setup: clinic_members 作成", false, `status=${cmIns.status} body=${cmIns.text.slice(0, 200)}`);
    throw new Error("clinic_members 作成に失敗");
  }
  rec("setup: clinic_members 作成", true, `member=${memberId}`);

  step(`setup: 翌々日(${date2}) 10:00-16:00 の open 枠を施術室2に作成`);
  const startISO = new Date(`${date2}T10:00:00+09:00`).toISOString();
  const endISO = new Date(`${date2}T16:00:00+09:00`).toISOString();
  const blkIns = await rest("schedule_blocks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      clinic_id: CLINIC,
      member_id: memberId,
      room_id: ROOM2,
      time_range: `[${startISO},${endISO})`,
      block_type: "open",
    }),
  });
  const blockId = blkIns.json?.[0]?.id ?? null;
  if (!blockId) {
    rec("setup: open 枠作成", false, `status=${blkIns.status} body=${blkIns.text.slice(0, 200)}`);
    throw new Error("open 枠作成に失敗");
  }
  rec("setup: open 枠作成", true, `block=${blockId}`);

  // ============================================================
  // 検証1【BC-NEW-02】is_bookable=false のスタッフの枠は公開空き枠に出ない
  // (?member= でこのスタッフの枠に限定して隔離検証)
  // ============================================================
  step("=== 検証1【BC-NEW-02】is_bookable=false ===");
  {
    const { html } = await fetchReserve({ service: SVC, date: date2, member: memberId });
    const empty = isEmpty(html);
    rec(
      "検証1a[BC-NEW-02]: is_bookable=false のスタッフの枠は出ない",
      empty,
      `empty=${empty} chips=${timeChipCount(html)}`,
    );
  }
  // 対照: is_bookable=true + 担当割当 追加 → 出る
  await setMember({ is_bookable: true });
  await addAssignment();
  {
    const { html } = await fetchReserve({ service: SVC, date: date2, member: memberId });
    const chips = timeChipCount(html);
    rec(
      "検証1b[BC-NEW-02 対照]: is_bookable=true + 担当割当ありで枠が出る",
      !isEmpty(html) && chips > 0,
      `empty=${isEmpty(html)} chips=${chips}`,
    );
  }

  // ============================================================
  // 検証2【No.9】担当割当が無いサービスの空き枠には出ない(is_bookable=true のまま)
  // ============================================================
  step("=== 検証2【No.9】担当割当なし ===");
  await delAssignment();
  {
    const { html } = await fetchReserve({ service: SVC, date: date2, member: memberId });
    rec(
      "検証2[No.9]: 担当割当が無いサービスの空き枠に出ない(is_bookable=true のまま)",
      isEmpty(html),
      `empty=${isEmpty(html)} chips=${timeChipCount(html)}`,
    );
  }

  // ============================================================
  // 検証3【No.34】退職(status=inactive)スタッフの枠は出ない
  // ============================================================
  step("=== 検証3【No.34】status=inactive ===");
  await addAssignment(); // 担当割当を戻す(除外要因を status のみに限定)
  await setMember({ status: "inactive" });
  {
    const { html } = await fetchReserve({ service: SVC, date: date2, member: memberId });
    rec(
      "検証3[No.34]: status=inactive のスタッフの枠は出ない",
      isEmpty(html),
      `empty=${isEmpty(html)} chips=${timeChipCount(html)}`,
    );
  }

  // ============================================================
  // 検証4【F8】display_name=null のスタッフは指名チップに本名(full_name)で出ない
  // ============================================================
  step("=== 検証4【F8】display_name=null で本名露出しない ===");
  await setMember({ status: "active" }); // active/bookable/担当割当あり/ display_name は null のまま
  // 復帰確認: ?member= で枠が再度出る(active に戻したことの確認)
  {
    const { html } = await fetchReserve({ service: SVC, date: date2, member: memberId });
    rec(
      "検証4-前提: active/bookable/担当割当に戻すと枠が再度出る",
      !isEmpty(html) && timeChipCount(html) > 0,
      `empty=${isEmpty(html)} chips=${timeChipCount(html)}`,
    );
  }
  // 指名チップ描画(?member 無し)で本名が出ないこと
  const { html: chipHtml } = await fetchReserve({ service: SVC, date: date2 });
  rec(
    "検証4[F8]: display_name=null のスタッフの本名(full_name)が指名チップに出ない",
    !chipHtml.includes(FULLNAME),
    `本名文字列の出現=${chipHtml.includes(FULLNAME)}`,
  );

  // ============================================================
  // 検証5【回帰】seed の正常スタッフ(鈴木・田中)の枠・指名チップは従来どおり出る
  // ============================================================
  step("=== 検証5【回帰】seed 正常スタッフ ===");
  // 指名チップ: 鈴木・田中(display_name あり)は出る
  rec(
    "検証5a[回帰]: 指名チップに『鈴木』が表示される",
    chipHtml.includes("鈴木"),
    `出現=${chipHtml.includes("鈴木")}`,
  );
  rec(
    "検証5b[回帰]: 指名チップに『田中』が表示される",
    chipHtml.includes("田中"),
    `出現=${chipHtml.includes("田中")}`,
  );
  // 空き枠: 将来の open 枠を持つ seed スタッフは(いずれかの日で)枠が出る
  const suzukiDates = await futureBlockDates(SUZUKI);
  if (suzukiDates.length > 0) {
    const r = await anyDateHasSlots(SUZUKI, suzukiDates);
    rec(
      "検証5c[回帰]: 鈴木(active/bookable/担当割当あり)の空き枠が出る",
      !r.empty && r.chips > 0,
      `候補日=${suzukiDates.join(",")} 採用=${r.date} empty=${r.empty} chips=${r.chips}`,
    );
  } else {
    step("検証5c: 鈴木に将来の open 枠が無い(seed 鮮度依存)ため枠検証はスキップ");
  }
  const tanakaDates = await futureBlockDates(TANAKA);
  if (tanakaDates.length > 0) {
    const r = await anyDateHasSlots(TANAKA, tanakaDates);
    rec(
      "検証5d[回帰]: 田中(active/bookable/担当割当あり)の空き枠が出る",
      !r.empty && r.chips > 0,
      `候補日=${tanakaDates.join(",")} 採用=${r.date} empty=${r.empty} chips=${r.chips}`,
    );
  } else {
    step("検証5d: 田中に将来の open 枠が無い(seed 鮮度依存)ため枠検証はスキップ");
  }
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  aborted = true;
} finally {
  // ============================================================
  // 復元: 作成した枠・担当割当・member・auth ユーザーを必ず削除
  // ============================================================
  step("finally: テストデータを削除(復元)");
  if (userId) {
    await cleanupMemberByUserId(userId);
    const del = await adminAuth(`admin/users/${userId}`, { method: "DELETE" });
    step(`finally: auth ユーザー削除 status=${del.status}`);
  }
  // 念のため email 起点でも掃除(userId 未取得時の保険)
  const leftover = await findAuthUserByEmail(AVAIL_EMAIL);
  if (leftover) {
    await cleanupMemberByUserId(leftover.id);
    await adminAuth(`admin/users/${leftover.id}`, { method: "DELETE" });
    step("finally: 残存していた e2e-avail ユーザーを追加削除");
  }
}

// --- 集計 ---
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\nSUMMARY: ${pass}/${results.length} passed`);
if (fail > 0) {
  console.log("FAILED:");
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.detail ?? ""}`);
}
const MIN_CHECKS = 14; // 期待するチェック数(下回る = 途中で飛ばされた)
if (aborted) console.log("ABORTED: 例外で中断したため、以降のチェックは実行されていません");
if (!aborted && results.length < MIN_CHECKS)
  console.log(`INCOMPLETE: チェック数 ${results.length} が期待 ${MIN_CHECKS} を下回っています`);
const allGreen = fail === 0 && !aborted && results.length >= MIN_CHECKS;
console.log(allGreen ? "AVAILABILITY_OK" : "AVAILABILITY_FAILED");
process.exit(allGreen ? 0 : 1);
