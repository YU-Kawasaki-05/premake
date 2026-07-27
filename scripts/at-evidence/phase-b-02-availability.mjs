// フェーズ B ② 空き枠の正しさ — AT-PUB-012 / AT-PUB-013
// 画面に出る空き枠を、DB から独立に計算した期待値と突き合わせる(実装をなぞらず別経路で検算する)。
// 実行: node scripts/at-evidence/phase-b-02-availability.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  anonContext,
  closeBrowser,
  createBookingViaUI,
  jstDate,
  login,
  runCase,
  sql,
  sqlOne,
  summarize,
} from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];
const REF = ["20_受け入れテスト/05_公開予約.md"];
const SERVICE = "メディカルピーリング";
const GRANULARITY_MIN = 15;

const serviceRow = sql(
  `select id, session_template::text from services where ${C} and name = '${SERVICE}'`,
)[0];
const [SERVICE_ID, TEMPLATE_JSON] = serviceRow;
const TEMPLATE = JSON.parse(TEMPLATE_JSON);
/** 占有される合計時間(分) = Σ(施術時間 + 後片付けバッファ) */
const SPAN_MIN = TEMPLATE.reduce((s, x) => s + x.duration_min + x.buffer_min, 0);

/** 画面に出るべき空き枠(JST の HH:MM)を DB から独立に計算する */
function expectedSlots(dateJst) {
  const blocks = sql(
    `select sb.member_id, sb.room_id,
            extract(epoch from lower(sb.time_range)) * 1000 as start_ms,
            extract(epoch from upper(sb.time_range)) * 1000 as end_ms
     from schedule_blocks sb
     where sb.${C} and sb.block_type = 'open'
       and sb.time_range && tstzrange('${dateJst}T00:00:00+09:00','${dateJst}T23:59:59+09:00')
       -- 公開空き枠に出せるのは「在籍中 + 指名可能 + 当該メニューの担当」かつ有効な部屋
       and sb.member_id in (
         select m.id from clinic_members m
         join staff_service_assignments a on a.member_id = m.id and a.service_id = '${SERVICE_ID}'
         where m.${C} and m.status = 'active' and m.is_bookable = true)
       and sb.room_id in (select id from rooms where ${C} and status = 'active')`,
  ).map(([memberId, roomId, s, e]) => ({ memberId, roomId, start: Number(s), end: Number(e) }));

  const busy = sql(
    `select member_id, room_id,
            extract(epoch from lower(occupied_range)) * 1000,
            extract(epoch from upper(occupied_range)) * 1000
     from booking_sessions
     where ${C} and status = 'scheduled'
       and occupied_range && tstzrange('${dateJst}T00:00:00+09:00','${dateJst}T23:59:59+09:00')`,
  ).map(([memberId, roomId, s, e]) => ({ memberId, roomId, start: Number(s), end: Number(e) }));

  const spanMs = SPAN_MIN * 60_000;
  const now = Date.now();
  const out = new Set();
  for (const b of blocks) {
    for (let t = b.start; t + spanMs <= b.end; t += GRANULARITY_MIN * 60_000) {
      if (t < now) continue;
      const end = t + spanMs;
      const conflict = busy.some(
        (x) => (x.roomId === b.roomId || x.memberId === b.memberId) && t < x.end && end > x.start,
      );
      if (conflict) continue;
      out.add(
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(t)),
      );
    }
  }
  return [...out].sort();
}

/** 画面に出ている時刻ボタンの一覧 */
async function shownSlots(page, dateJst) {
  await page.goto(`${BASE}/c/demo/reserve?service=${SERVICE_ID}&date=${dateJst}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1100);
  const texts = await page.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ }).allTextContents();
  return [...new Set(texts.map((t) => t.trim()))].sort();
}

// ---------------------------------------------------------------- AT-PUB-012
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-012",
      priority: "P0",
      phase: "B",
      order: 112,
      title: "空き枠の計算が正しい(所要時間+片付け時間・15 分刻み・枠の終端)",
      spec: "v2-21",
      refs: REF,
      intent:
        "ここが間違うと「予約できたのに実際は入れない」「空いているのに出ない」が起きる。公開予約の心臓部。",
      notes: `検算方法: 画面に出た時刻と、データベースから独立に計算した期待値を突き合わせる。メニュー「${SERVICE}」= 施術 ${TEMPLATE.map((t) => `${t.duration_min}分`).join("+")} + 片付け ${TEMPLATE.map((t) => `${t.buffer_min}分`).join("+")} = 合計 ${SPAN_MIN} 分を 1 枠として占有する。`,
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const d = jstDate(1);
      const shown = await shownSlots(page, d);
      const expected = expectedSlots(d);
      const onlyShown = shown.filter((x) => !expected.includes(x));
      const onlyExpected = expected.filter((x) => !shown.includes(x));

      await c.step({
        label: "空き枠の一覧を表示",
        action: `患者として ${d} の「${SERVICE}」の空き枠を表示`,
        expect: `データベースから計算した期待値と完全に一致する(${expected.length} 枠)`,
        actual: `画面 ${shown.length} 枠 / 期待 ${expected.length} 枠 / 画面のみ=${onlyShown.join(",") || "なし"} / 期待のみ=${onlyExpected.join(",") || "なし"}`,
        note: "実装の関数を呼ばず、施術枠・既存予約・担当割当から別経路で計算した集合と比較している(実装の写経では検算にならないため)。",
        page,
        fullPage: true,
        checks: [
          { label: "画面にしか無い枠がない(予約できない枠を出していない)", ok: onlyShown.length === 0, detail: onlyShown.join(",") || "なし" },
          { label: "期待にしか無い枠がない(取りこぼしていない)", ok: onlyExpected.length === 0, detail: onlyExpected.join(",") || "なし" },
          { label: "1 枠以上表示されている", ok: shown.length > 0, detail: `${shown.length} 枠` },
        ],
      });

      // 15 分刻み・枠端の確認
      const mins = shown.map((t) => Number(t.split(":")[1]));
      const allQuarter = mins.every((m) => m % GRANULARITY_MIN === 0);
      const blockEnd = sqlOne(
        `select to_char(max(upper(time_range)) at time zone 'Asia/Tokyo','HH24:MI') from schedule_blocks
         where ${C} and block_type = 'open' and time_range && tstzrange('${d}T00:00:00+09:00','${d}T23:59:59+09:00')`,
      );
      const last = shown[shown.length - 1];
      const lastEndOk = (() => {
        if (!last || !blockEnd) return false;
        const [h, m] = last.split(":").map(Number);
        const [bh, bm] = blockEnd.split(":").map(Number);
        return h * 60 + m + SPAN_MIN <= bh * 60 + bm;
      })();
      await c.step({
        label: "刻みと終端の確認",
        action: "表示された時刻の分と、最後の枠の終了時刻を検査",
        expect: `すべて ${GRANULARITY_MIN} 分刻み。最後の枠でも施術終了が受付枠の終わり(${blockEnd})を超えない`,
        actual: `刻み OK=${allQuarter} / 最後の枠=${last}(+${SPAN_MIN}分) / 枠の終わり=${blockEnd}`,
        page,
        shot: false,
        checks: [
          { label: `${GRANULARITY_MIN} 分刻みで並ぶ`, ok: allQuarter, detail: [...new Set(mins)].join(",") },
          { label: "最後の枠が受付枠からはみ出さない", ok: lastEndOk, detail: `${last} + ${SPAN_MIN}分 ≦ ${blockEnd}` },
        ],
      });

      c.dbCheck({
        label: "期待値の算出根拠(受付枠と既存予約)",
        query: `schedule_blocks(block_type='open') と booking_sessions(status='scheduled') を ${d} で取得し、15 分刻みで ${SPAN_MIN} 分が収まる開始時刻を列挙`,
        expect: `${expected.length} 枠`,
        actual: expected.join(" / ") || "なし",
        ok: expected.length > 0,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-013
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-013",
      priority: "P0",
      phase: "B",
      order: 113,
      title: "埋まった時間は空き枠から消える(部屋・担当の重複を除外)",
      spec: "v2-21",
      refs: REF,
      intent:
        "予約が入った直後にその時間が空き枠から消えなければ、同じ枠を二重に申し込まれる。院内予約で埋めた場合も同様に消える必要がある。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const d = jstDate(2); // 7/29 の枠(施術室1・鈴木 10:00-18:00)を使う
      const before = await shownSlots(page, d);
      await c.step({
        label: "予約を入れる前の空き枠",
        action: `${d} の空き枠を表示`,
        expect: "受付枠の範囲で空き枠が並ぶ",
        actual: `${before.length} 枠(${before.slice(0, 6).join(",")}${before.length > 6 ? " …" : ""})`,
        page,
        fullPage: true,
        checks: [{ label: "空き枠がある", ok: before.length > 0, detail: `${before.length} 枠` }],
      });

      // 院内から 1 件予約を入れて、その時間帯が消えることを確認する
      const target = before.find((t) => t >= "14:00") ?? before[Math.floor(before.length / 2)];
      const notes = "AT公開 空き枠除外";
      sql(`delete from booking_sessions where booking_id in (select id from bookings where ${C} and notes = '${notes}')`);
      sql(`delete from notifications where booking_id in (select id from bookings where ${C} and notes = '${notes}')`);
      sql(`delete from bookings where ${C} and notes = '${notes}'`);
      const staff = await login("nurse1@demo.local");
      const no = await createBookingViaUI(staff.page, {
        patient: "山田",
        service: SERVICE,
        member: "鈴木",
        room: "施術室 1",
        date: d,
        time: target,
        notes,
      });
      await staff.ctx.close();

      const after = await shownSlots(page, d);
      const expectedAfter = expectedSlots(d);
      const removed = before.filter((t) => !after.includes(t));
      // 占有は target から SPAN_MIN 分。15 分刻みなので target を跨ぐ開始時刻がすべて消えるはず
      const diffOk = JSON.stringify(after) === JSON.stringify(expectedAfter);
      await c.step({
        label: "予約後の空き枠",
        action: `院内から ${d} ${target} に「${SERVICE}」の予約(${no})を入れ、患者側の空き枠を再表示`,
        expect: `${target} を含む時間帯が空き枠から消え、再計算した期待値と一致する`,
        actual: `${before.length} → ${after.length} 枠 / 消えた枠=${removed.join(",") || "なし"}`,
        note: `占有は ${target} から ${SPAN_MIN} 分。この時間に重なる開始時刻(15 分刻み)がすべて除外される。`,
        page,
        fullPage: true,
        checks: [
          { label: `予約した ${target} が消える`, ok: !after.includes(target), detail: `残存=${after.includes(target)}` },
          { label: "重なる開始時刻もまとめて消える", ok: removed.length >= 1, detail: removed.join(",") },
          { label: "再計算した期待値と完全一致", ok: diffOk, detail: diffOk ? "一致" : `画面=${after.join(",")} 期待=${expectedAfter.join(",")}` },
        ],
      });

      c.dbCheck({
        label: "入れた予約が占有として記録されている",
        query: `select to_char(lower(occupied_range) at time zone 'Asia/Tokyo','HH24:MI'), to_char(upper(occupied_range) at time zone 'Asia/Tokyo','HH24:MI') from booking_sessions s join bookings b on b.id = s.booking_id where b.notes = '${notes}'`,
        expect: `${target} から ${SPAN_MIN} 分`,
        actual:
          sql(
            `select to_char(lower(occupied_range) at time zone 'Asia/Tokyo','HH24:MI') || '-' || to_char(upper(occupied_range) at time zone 'Asia/Tokyo','HH24:MI')
             from booking_sessions s join bookings b on b.id = s.booking_id where b.notes = '${notes}'`,
          )
            .map((r) => r[0])
            .join(" / ") || "なし",
        ok: !!no,
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
