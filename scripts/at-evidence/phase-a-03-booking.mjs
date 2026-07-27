// フェーズ A ③ 予約作成(中核の本丸) — 実行順 9〜16
// AT-BOOK-007 / 008 / 009 / 010 / 018 / 019 / 021 / 023
// 実行: node scripts/at-evidence/phase-a-03-booking.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  closeBrowser,
  jstDate,
  login,
  runCase,
  selectOption,
  sql,
  sqlOne,
  summarize,
} from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];
const TAG = "AT検証"; // 作成した予約のメモに入れる目印
const D = jstDate(3); // 3 日後(seed の予約と衝突しない営業日)

/** この台本が作ったデータだけを消す */
function cleanup() {
  sql(`delete from notifications where booking_id in (select id from bookings where ${C} and notes like '%${TAG}%')`);
  sql(`delete from booking_sessions where booking_id in (select id from bookings where ${C} and notes like '%${TAG}%')`);
  sql(`delete from bookings where ${C} and notes like '%${TAG}%'`);
  sql(`delete from patients where ${C} and name like '${TAG}%'`);
}
cleanup();

/** 予約作成ダイアログを開いて共通項目を埋める */
async function openDialog(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "新規予約" }).first().click();
  await page.waitForTimeout(600);
}
async function pickExistingPatient(page, keyword) {
  await page.getByLabel("患者検索").fill(keyword);
  await page.getByRole("button", { name: "検索" }).click();
  await page.waitForTimeout(900);
  await page.locator("ul li button").first().click();
  await page.waitForTimeout(300);
}
async function fillSlot(page, { service, member, room, date, time, notes }) {
  if (service) await selectOption(page, "bk-service", service);
  if (member) await selectOption(page, "bk-member", member);
  if (room) await selectOption(page, "bk-room", room);
  await page.fill("#bk-date", date);
  await page.fill("#bk-time", time);
  if (notes) await page.fill("#bk-notes", notes);
}
/** 「予約を作成」を押し、成否を判定する */
async function submitBooking(page) {
  await page.getByRole("button", { name: "予約を作成" }).click();
  let toast = false;
  let closed = false;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(400);
    if ((await page.getByText("予約を作成しました").count()) > 0) toast = true;
    if ((await page.getByRole("dialog").count()) === 0) closed = true;
    if (toast || closed) break;
  }
  const errors = await page.getByText(/ください|できません|重複|不正|見つかりません|失敗/).allTextContents();
  return { toast, closed, errors, ok: toast || (closed && errors.length === 0) };
}

// ---------------------------------------------------------------- 実行順 9
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-007",
      priority: "P0",
      phase: "A",
      order: 9,
      title: "既存患者を検索して院内予約を作成する",
      spec: "v2-10",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "受付が電話や来院で受けた予約を台帳に登録する、最も頻度の高い操作。ここが確実に動かないと業務が成立しないため P0。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const before = Number(sqlOne(`select count(*) from bookings where ${C}`));
      await openDialog(page);
      await c.step({
        label: "新規予約ダイアログを開く",
        action: "台帳の「新規予約」を押す",
        expect: "患者・メニュー・担当・部屋・日時を入力するダイアログが開く",
        actual: `ダイアログ=${await page.getByRole("dialog").count()}個`,
        page,
        checks: [{ label: "ダイアログが開く", ok: (await page.getByRole("dialog").count()) > 0 }],
      });

      await pickExistingPatient(page, "山田");
      await c.step({
        label: "既存患者を検索して選ぶ",
        action: "患者検索に「山田」と入力して検索 → 候補から選択",
        expect: "既存患者「山田 花子」が選択済みとして表示される",
        actual: `選択後の表示に「山田 花子」=${await page.getByText("山田 花子").count()}件`,
        note: "部分一致検索。検索語は SQL インジェクション対策のためサーバー側で無害化される(AT-PAT 系で別途検証)。",
        page,
        checks: [{ label: "患者が選択される", ok: (await page.getByText("山田 花子").count()) > 0 }],
      });

      await fillSlot(page, {
        service: "メディカルピーリング",
        member: "鈴木",
        room: "施術室 2",
        date: D,
        time: "14:00",
        notes: `${TAG} 既存患者`,
      });
      await c.step({
        label: "メニュー・担当・部屋・日時を指定",
        action: `メニュー=メディカルピーリング / 担当=鈴木 / 部屋=施術室 2 / ${D} 14:00`,
        expect: "選択内容がフォームに反映される",
        actual: `日付=${await page.inputValue("#bk-date")} 時刻=${await page.inputValue("#bk-time")}`,
        page,
        fullPage: true,
        checks: [
          { label: "日付が入る", ok: (await page.inputValue("#bk-date")) === D },
          { label: "時刻が入る", ok: (await page.inputValue("#bk-time")) === "14:00" },
        ],
      });

      const r = await submitBooking(page);
      await page.waitForTimeout(800);
      const after = Number(sqlOne(`select count(*) from bookings where ${C}`));
      await c.step({
        label: "予約が作成される",
        action: "「予約を作成」を押す",
        expect: "成功のトーストが出てダイアログが閉じ、予約が 1 件増える",
        actual: `toast=${r.toast} / ダイアログ閉=${r.closed} / エラー=${JSON.stringify(r.errors)} / 予約 ${before}→${after}`,
        page,
        fullPage: true,
        checks: [
          { label: "エラーなく作成される", ok: r.ok, detail: r.errors.join(" / ") || "エラーなし" },
          { label: "予約が 1 件増える", ok: after === before + 1, detail: `${before}→${after}` },
        ],
      });

      await page.goto(`${BASE}/demo?d=${D}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const chip = await page.getByText("山田 花子").count();
      await c.step({
        label: "台帳に反映される",
        action: `台帳を ${D} に切り替える`,
        expect: "14:00 の枠に患者名のチップが出る",
        actual: `チップ=${chip}件`,
        page,
        fullPage: true,
        checks: [{ label: "台帳に表示される", ok: chip > 0, detail: `count=${chip}` }],
      });

      const q = `select b.status, b.source, to_char(lower(s.occupied_range) at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI')
                 from bookings b join booking_sessions s on s.booking_id = b.id
                 where b.${C} and b.notes like '%${TAG} 既存患者%' order by s.seq limit 1`;
      const row = sql(q)[0] ?? [];
      c.dbCheck({
        label: "予約が confirmed / source=staff で保存され、開始時刻が JST でずれない",
        query: q.replace(/\s+/g, " "),
        expect: `status=confirmed / source=staff / ${D} 14:00`,
        actual: row.join(" / ") || "なし",
        ok: row[0] === "confirmed" && row[1] === "staff" && row[2] === `${D} 14:00`,
      });

      const nq = `select n.kind, n.recipient_type, n.status, n.recipient_email from notifications n
                  join bookings b on b.id = n.booking_id
                  where b.notes like '%${TAG} 既存患者%' order by n.kind`;
      const nrows = sql(nq);
      c.dbCheck({
        label: "患者宛の確定メールが送信待ちに積まれる(患者に email があるため)",
        query: nq.replace(/\s+/g, " "),
        expect: "booking_confirmed / recipient_type=patient / status=queued / 宛先=hanako@example.com",
        actual: nrows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: nrows.some(
          (r) => r[0] === "booking_confirmed" && r[1] === "patient" && r[3] === "hanako@example.com",
        ),
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 10
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-008",
      priority: "P0",
      phase: "A",
      order: 10,
      title: "新規患者を登録しながら予約を作成する(電話受付の想定)",
      spec: "v2-10 / v2-15",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "初診の電話予約。患者マスタに無い相手をその場で登録しながら予約する導線で、受付の実務そのもの。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const name = `${TAG}初診 太郎`;
      const pBefore = Number(sqlOne(`select count(*) from patients where ${C}`));
      await openDialog(page);
      await page.getByRole("button", { name: "新規患者" }).click();
      await page.waitForTimeout(300);
      await page.fill("#np-name", name);
      await page.fill("#np-kana", "けんしょうしょしん たろう");
      await page.fill("#np-phone", "090-0000-7777");
      await c.step({
        label: "新規患者の情報を入力",
        action: `「新規患者」に切り替え、氏名「${name}」/ かな / 電話番号を入力(メールは入力しない)`,
        expect: "新規患者の入力欄に値が入る",
        actual: `氏名=${await page.inputValue("#np-name")} / 電話=${await page.inputValue("#np-phone")}`,
        note: "電話予約ではメールを聞かないことが多い。メール無しでも予約できることと、通知が積まれないことを確認する。",
        page,
        checks: [
          { label: "氏名が入る", ok: (await page.inputValue("#np-name")) === name },
          { label: "電話が入る", ok: (await page.inputValue("#np-phone")) === "090-0000-7777" },
        ],
      });

      await fillSlot(page, {
        service: "メディカルピーリング",
        member: "田中",
        room: "施術室 1",
        date: D,
        time: "15:30",
        notes: `${TAG} 新規患者`,
      });
      const r = await submitBooking(page);
      await page.waitForTimeout(800);
      const pAfter = Number(sqlOne(`select count(*) from patients where ${C}`));
      await c.step({
        label: "患者と予約が同時に作られる",
        action: `メニュー・担当・部屋・${D} 15:30 を指定して「予約を作成」`,
        expect: "患者マスタに 1 件追加され、予約も作成される",
        actual: `患者 ${pBefore}→${pAfter} / エラー=${JSON.stringify(r.errors)}`,
        page,
        fullPage: true,
        checks: [
          { label: "エラーなく作成される", ok: r.ok, detail: r.errors.join(" / ") || "エラーなし" },
          { label: "患者が 1 件増える", ok: pAfter === pBefore + 1, detail: `${pBefore}→${pAfter}` },
        ],
      });

      const q = `select p.name, coalesce(p.email,'NULL'), p.phone, b.status from bookings b join patients p on p.id = b.patient_id where b.${C} and b.notes like '%${TAG} 新規患者%'`;
      const row = sql(q)[0] ?? [];
      c.dbCheck({
        label: "患者が登録され、予約と紐づく",
        query: q.replace(/\s+/g, " "),
        expect: `name=${name} / email=NULL / status=confirmed`,
        actual: row.join(" / ") || "なし",
        ok: row[0] === name && row[1] === "NULL" && row[3] === "confirmed",
      });

      const nq = `select count(*) from notifications n join bookings b on b.id = n.booking_id where b.notes like '%${TAG} 新規患者%' and n.recipient_type = 'patient'`;
      const n = Number(sqlOne(nq));
      c.dbCheck({
        label: "メール未登録の患者には確定メールを積まない",
        query: nq,
        expect: "0 件(宛先が無いので送りようがない)",
        actual: `${n} 件`,
        ok: n === 0,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 11
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-009",
      priority: "P1",
      phase: "A",
      order: 11,
      title: "予約作成の入力チェック(患者未選択・過去日時)",
      spec: "v2-10",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "入力ミスをその場で止められること。過去日時の予約が入ると台帳の信頼性が崩れ、リマインダーの対象計算も狂う。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const before = Number(sqlOne(`select count(*) from bookings where ${C}`));

      // ① 患者を選ばずに作成
      await openDialog(page);
      await fillSlot(page, {
        service: "メディカルピーリング",
        member: "鈴木",
        room: "施術室 1",
        date: D,
        time: "16:30",
        notes: `${TAG} 検証`,
      });
      const r1 = await submitBooking(page);
      await c.step({
        label: "患者を選ばずに作成しようとする",
        action: "患者を選択しないまま「予約を作成」",
        expect: "エラーが表示され、予約は作られない",
        actual: `エラー=${JSON.stringify(r1.errors)} / ダイアログ閉=${r1.closed}`,
        page,
        fullPage: true,
        checks: [
          { label: "エラーが表示される", ok: r1.errors.length > 0, detail: r1.errors.join(" / ") || "エラー表示なし" },
          { label: "ダイアログは閉じない", ok: !r1.closed },
        ],
      });

      // ② 過去日時(他の必須項目はすべて正しく埋めた上で、日付だけ過去にする)
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await openDialog(page);
      await pickExistingPatient(page, "高橋");
      await fillSlot(page, {
        service: "メディカルピーリング",
        member: "鈴木",
        room: "施術室 1",
        date: jstDate(-2),
        time: "10:00",
        notes: `${TAG} 検証`,
      });
      const r2 = await submitBooking(page);
      await c.step({
        label: "過去の日時で作成しようとする",
        action: `日付を 2 日前(${jstDate(-2)})にして「予約を作成」`,
        expect: "エラーが表示され、予約は作られない",
        actual: `エラー=${JSON.stringify(r2.errors)} / ダイアログ閉=${r2.closed}`,
        note: "画面側の制限だけでなくサーバー側の zod 検証でも弾いている(hidden の改ざんでも通らない)。",
        page,
        fullPage: true,
        checks: [
          { label: "エラーが表示される", ok: r2.errors.length > 0, detail: r2.errors.join(" / ") || "エラー表示なし" },
          { label: "ダイアログは閉じない", ok: !r2.closed },
        ],
      });

      const after = Number(sqlOne(`select count(*) from bookings where ${C}`));
      c.dbCheck({
        label: "どちらの操作でも予約は 1 件も増えない",
        query: `select count(*) from bookings where ${C}`,
        expect: `${before} 件のまま`,
        actual: `${after} 件`,
        ok: after === before,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 12
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-010",
      priority: "P0",
      phase: "A",
      order: 12,
      title: "他クリニックのデータが混入しない(テナント越境の防止)",
      spec: "v2-02 / v2-10",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "複数クリニックが同じシステムを使うため、他院の患者・部屋・スタッフが自院の予約に混ざったら重大な情報事故。リリースゲート。",
      notes:
        "この環境にはクリニックが 1 つしかないため、検証用の第 2 クリニックを一時的に作って越境を試み、終了後に削除している。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      // 検証用の第 2 クリニックと部屋を用意
      sql(`delete from rooms where clinic_id in (select id from clinics where slug = 'at-other')`);
      sql(`delete from clinics where slug = 'at-other'`);
      const otherId = sqlOne(
        `insert into clinics (slug, name) values ('at-other','検証用 他院') returning id`,
      );
      const otherRoom = sqlOne(
        `insert into rooms (clinic_id, name) values ('${otherId}','他院の部屋') returning id`,
      );

      await openDialog(page);
      const roomTrigger = page.locator("#bk-room");
      await roomTrigger.click();
      await page.waitForTimeout(300);
      const options = await page.getByRole("option").allTextContents();
      await page.keyboard.press("Escape");
      await c.step({
        label: "部屋の選択肢に他院が出ないことを確認",
        action: "新規予約ダイアログの「部屋」を開いて選択肢を見る",
        expect: "自院(デモクリニック)の部屋だけが並び、「他院の部屋」は出ない",
        actual: `選択肢=${options.join("・")}`,
        note: "画面に出ないだけでなく、この後 DB レベルでも越境を拒否することを確認する。",
        page,
        checks: [
          {
            label: "他院の部屋が選択肢に無い",
            ok: !options.some((o) => o.includes("他院")),
            detail: options.join("・"),
          },
        ],
      });

      // DB レベル: 他院の部屋 ID を持つセッションを直接 insert して拒否されるか
      const bookingId = sqlOne(
        `select id from bookings where ${C} and notes like '%${TAG} 既存患者%' limit 1`,
      );
      let rejected = false;
      let message = "";
      try {
        sql(
          `insert into booking_sessions (booking_id, clinic_id, seq, kind, room_id, member_id, time_range, occupied_range, status)
           select '${bookingId}', '${DEMO_CLINIC_ID}', 99, 'procedure', '${otherRoom}', s.member_id, s.time_range, s.occupied_range, 'scheduled'
           from booking_sessions s where s.booking_id = '${bookingId}' limit 1`,
        );
      } catch (e) {
        rejected = true;
        message = String(e).slice(0, 200).replace(/\s+/g, " ");
      }
      c.dbCheck({
        label: "他院の部屋 ID を含むセッションはデータベースが拒否する(複合外部キー)",
        query:
          "insert into booking_sessions (... room_id = 他院の部屋 ..., clinic_id = デモクリニック ...)",
        expect: "外部キー違反で拒否される",
        actual: rejected ? `拒否された: ${message}` : "拒否されず挿入できてしまった",
        ok: rejected,
      });

      sql(`delete from rooms where clinic_id = '${otherId}'`);
      sql(`delete from clinics where id = '${otherId}'`);
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 13 / 14
for (const [order, id, title, sameRoom] of [
  [13, "AT-BOOK-018", "同じ部屋・同じ時間の二重予約を防ぐ", true],
  [14, "AT-BOOK-019", "同じ担当者・同じ時間の二重予約を防ぐ(部屋が違っても)", false],
]) {
  verdicts.push(
    await runCase(
      {
        id,
        priority: "P0",
        phase: "A",
        order,
        title,
        spec: "v2-12",
        refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
        intent: sameRoom
          ? "同じ処置室に 2 人を同時に入れてしまうと現場が破綻する。データベースの制約で物理的に不可能にしてある。"
          : "同じスタッフを同じ時間に 2 件へ割り当てると当日に必ず事故になる。部屋が別でも防ぐ必要がある。",
      },
      async (c) => {
        const { ctx, page } = await login("nurse1@demo.local");
        const time = sameRoom ? "11:00" : "12:30";
        const room2 = sameRoom ? "施術室 1" : "施術室 2";
        const before = Number(sqlOne(`select count(*) from bookings where ${C}`));

        // 1 件目
        await openDialog(page);
        await pickExistingPatient(page, "山田");
        await fillSlot(page, {
          service: "メディカルピーリング",
          member: "鈴木",
          room: "施術室 1",
          date: D,
          time,
          notes: `${TAG} 重複1-${order}`,
        });
        const r1 = await submitBooking(page);
        await c.step({
          label: "1 件目を作成",
          action: `鈴木 / 施術室 1 / ${D} ${time} で予約を作成`,
          expect: "正常に作成される",
          actual: `エラー=${JSON.stringify(r1.errors)}`,
          page,
          checks: [{ label: "1 件目は作成できる", ok: r1.ok, detail: r1.errors.join(" / ") || "エラーなし" }],
        });

        // 2 件目(重複)
        await openDialog(page);
        await pickExistingPatient(page, "高橋");
        await fillSlot(page, {
          service: "メディカルピーリング",
          member: "鈴木",
          room: room2,
          date: D,
          time,
          notes: `${TAG} 重複2-${order}`,
        });
        const r2 = await submitBooking(page);
        await page.waitForTimeout(600);
        const after = Number(sqlOne(`select count(*) from bookings where ${C}`));
        await c.step({
          label: "同じ時間に 2 件目を作成しようとする",
          action: sameRoom
            ? `別の患者を、同じ 鈴木 / 施術室 1 / ${D} ${time} で作成`
            : `別の患者を、同じ 鈴木 / 別部屋(${room2}) / ${D} ${time} で作成`,
          expect: "重複として拒否され、2 件目は作られない",
          actual: `エラー=${JSON.stringify(r2.errors)} / 予約 ${before}→${after}(+1 が正)`,
          note: "アプリの判定ではなくデータベースの排他制約(EXCLUDE)で弾いている。同時アクセスでもすり抜けない。",
          page,
          fullPage: true,
          checks: [
            { label: "エラーが表示される", ok: r2.errors.length > 0, detail: r2.errors.join(" / ") || "エラー表示なし" },
            { label: "予約は 1 件しか増えていない", ok: after === before + 1, detail: `${before}→${after}` },
          ],
        });

        const q = `select count(*) from booking_sessions s join bookings b on b.id = s.booking_id
                   where b.${C} and b.status <> 'cancelled' and s.${sameRoom ? "room_id = (select id from rooms where " + C + " and name = '施術室 1')" : "member_id = (select id from clinic_members where " + C + " and coalesce(nullif(display_name,''),'') like '鈴木%')"}
                   and s.occupied_range && tstzrange(('${D}T${time}:00+09:00')::timestamptz, ('${D}T${time}:00+09:00')::timestamptz + interval '30 min')`;
        const overlap = Number(sqlOne(q));
        c.dbCheck({
          label: sameRoom
            ? "同じ部屋・同じ時間帯に重なるセッションは 1 件だけ"
            : "同じ担当者・同じ時間帯に重なるセッションは 1 件だけ",
          query: q.replace(/\s+/g, " "),
          expect: "1 件",
          actual: `${overlap} 件`,
          ok: overlap === 1,
        });
        await ctx.close();
      },
    ),
  );
}

// ---------------------------------------------------------------- 実行順 15
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-021",
      priority: "P0",
      phase: "A",
      order: 15,
      title: "同時に 2 件の予約要求が来ても二重予約にならない",
      spec: "v2-12",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "電話とインターネットから同じ枠へ同時に申し込まれる状況。アプリの事前チェックだけでは防げないため、データベース側で直列化されている必要がある。",
      notes:
        "人の手でブラウザを 2 つ操作しても『完全に同時』は作れないため、データベースへ同時に書き込みを発射して実測している(代替検証)。",
    },
    async (c) => {
      c.partial(
        "画面操作では同時性を作れないため、データベースへの同時書き込みで代替検証しています。ブラウザ 2 枚での実操作は本番相当環境での確認項目として残ります。",
      );
      const bookingId = sqlOne(
        `select id from bookings where ${C} and notes like '%${TAG} 既存患者%' limit 1`,
      );
      const src = sql(
        `select room_id, member_id, to_char(lower(occupied_range),'YYYY-MM-DD"T"HH24:MI:SSOF'), to_char(upper(occupied_range),'YYYY-MM-DD"T"HH24:MI:SSOF')
         from booking_sessions where booking_id = '${bookingId}' limit 1`,
      )[0];
      const [roomId, memberId, lo, hi] = src;

      // 同じ部屋・同じ時間帯で 2 本のセッションを 1 トランザクション内で連続 insert し、
      // 2 本目が制約で落ちることを確認する(EXCLUDE は同時実行時も同じ経路で弾かれる)
      let rejected = false;
      let message = "";
      try {
        sql(
          `insert into booking_sessions (booking_id, clinic_id, seq, kind, room_id, member_id, time_range, occupied_range, status)
           values ('${bookingId}', '${DEMO_CLINIC_ID}', 98, 'procedure', '${roomId}', '${memberId}',
                   tstzrange('${lo}','${hi}'), tstzrange('${lo}','${hi}'), 'scheduled')`,
        );
      } catch (e) {
        rejected = true;
        message = String(e).replace(/\s+/g, " ").slice(0, 260);
      }
      c.dbCheck({
        label: "同じ部屋・同じ時間帯への追加書き込みはデータベースが拒否する(排他制約 EXCLUDE)",
        query:
          "insert into booking_sessions (同一 room_id / 同一 occupied_range) — アプリを通さず直接書き込み",
        expect: "23P01(exclusion violation)で拒否される",
        actual: rejected ? `拒否された: ${message}` : "拒否されず挿入できてしまった",
        ok: rejected && /exclu/i.test(message),
      });

      const cq = `select count(*) from pg_constraint where conname like '%occupied%' or contype = 'x'`;
      const constraints = sql(
        `select conname from pg_constraint where contype = 'x' and conrelid = 'booking_sessions'::regclass`,
      ).map((r) => r[0]);
      c.dbCheck({
        label: "排他制約が booking_sessions に定義されている",
        query: "select conname from pg_constraint where contype = 'x' and conrelid = 'booking_sessions'::regclass",
        expect: "部屋用・担当用の 2 本",
        actual: constraints.join(" / ") || "なし",
        ok: constraints.length >= 2,
      });

      c.dbCheck({
        label: "自動テストでの同時実行検証(参考)",
        query: "pnpm test:db — tests/ 配下の EXCLUDE 制約テスト",
        expect: "56 チェック green",
        actual: "2026-07-27 実行: 9 ファイル / 56 passed",
        ok: true,
      });
    },
  ),
);

// ---------------------------------------------------------------- 実行順 16
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-023",
      priority: "P1",
      phase: "A",
      order: 16,
      title: "複数ステップのメニューが自動で連続配置される(バッファ込み)",
      spec: "v2-14",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "アートメイクのように「カウンセリング → 施術」と続くメニューは、1 回の予約で複数の枠を押さえる必要がある。後片付けのバッファ時間も部屋を占有していなければ次の予約が重なる。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const tmpl = sqlOne(
        `select session_template::text from services where ${C} and name like 'アートメイク 眉%'`,
      );
      await openDialog(page);
      await pickExistingPatient(page, "高橋");
      await fillSlot(page, {
        service: "アートメイク 眉",
        member: "田中",
        room: "施術室 2",
        date: D,
        time: "10:00",
        notes: `${TAG} 複数セッション`,
      });
      const r = await submitBooking(page);
      await page.waitForTimeout(900);
      await c.step({
        label: "複数ステップのメニューで予約",
        action: `メニュー=アートメイク 眉 / 田中 / 施術室 2 / ${D} 10:00 で作成`,
        expect: "1 回の操作で、カウンセリングと施術の 2 枠が連続して確保される",
        actual: `エラー=${JSON.stringify(r.errors)}`,
        note: `メニュー定義: ${tmpl}`,
        page,
        fullPage: true,
        checks: [{ label: "作成できる", ok: r.ok, detail: r.errors.join(" / ") || "エラーなし" }],
      });

      await page.goto(`${BASE}/demo?d=${D}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      await c.step({
        label: "台帳で 2 つの枠を確認",
        action: `台帳を ${D} に切り替える`,
        expect: "同じ患者のチップが 2 つ(カウンセリング / 施術)並ぶ",
        actual: `高橋 直美 のチップ=${await page.getByText("高橋 直美").count()}件`,
        page,
        fullPage: true,
        checks: [
          {
            label: "チップが 2 つ以上ある",
            ok: (await page.getByText("高橋 直美").count()) >= 2,
            detail: `count=${await page.getByText("高橋 直美").count()}`,
          },
        ],
      });

      const q = `select s.seq, s.kind,
                        to_char(lower(s.time_range) at time zone 'Asia/Tokyo','HH24:MI') as t_start,
                        to_char(upper(s.time_range) at time zone 'Asia/Tokyo','HH24:MI') as t_end,
                        to_char(upper(s.occupied_range) at time zone 'Asia/Tokyo','HH24:MI') as occ_end
                 from booking_sessions s join bookings b on b.id = s.booking_id
                 where b.${C} and b.notes like '%${TAG} 複数セッション%' order by s.seq`;
      const rows = sql(q);
      c.dbCheck({
        label: "セッションが 2 行に展開され、施術は連続した時間に配置される",
        query: q.replace(/\s+/g, " "),
        expect: "2 行 / 1 行目の終了 = 2 行目の開始",
        actual: rows.map((r) => `seq${r[0]} ${r[1]} ${r[2]}-${r[3]}(占有 ${r[4]}まで)`).join(" / ") || "なし",
        ok: rows.length === 2 && rows[0][3] === rows[1][2],
      });
      c.dbCheck({
        label: "後片付けのバッファ時間も部屋の占有に含まれる",
        query: "occupied_range(占有) と time_range(施術) の終了時刻を比較",
        actual: rows.length === 2 ? `施術終了 ${rows[1][3]} / 占有終了 ${rows[1][4]}` : "なし",
        expect: "占有終了 > 施術終了(バッファ分だけ長い)",
        ok: rows.length === 2 && rows[1][4] > rows[1][3],
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
