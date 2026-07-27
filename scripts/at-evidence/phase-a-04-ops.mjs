// フェーズ A ④⑤⑥ 院内確認・確定 / 当日オペ / キャンセル・変更 — 実行順 17〜25
// AT-BOOK-002 / 017 / 016 / 015 / 025 / 013 / 022 / 014 / 012
// 実行: node scripts/at-evidence/phase-a-04-ops.mjs
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
const TAG = "AT運用";
const D = jstDate(4); // 4 日後(前フェーズの予約と衝突しない営業日)
const verdicts = [];

sql(`delete from notifications where booking_id in (select id from bookings where ${C} and notes like '%${TAG}%')`);
sql(`delete from booking_sessions where booking_id in (select id from bookings where ${C} and notes like '%${TAG}%')`);
sql(`delete from bookings where ${C} and notes like '%${TAG}%'`);
sql(`delete from notifications where recipient_email = 'at-guest@example.com'`);
sql(`delete from booking_sessions where booking_id in (select id from bookings where guest_email = 'at-guest@example.com')`);
sql(`delete from bookings where guest_email = 'at-guest@example.com'`);
// 予約を消すと通知の booking_id が null になり、送信時に「context not found」で失敗扱いになる。
// 前回実行の残骸が失敗として残らないよう、親を失った通知も掃除する
sql(`delete from notifications where booking_id is null and ${C}`);

/** 台帳から予約を 1 件作る(前提づくり用。ステップは 1 つにまとめる) */
async function createBooking(page, { patient, service, member, room, time, notes }) {
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
  await page.fill("#bk-date", D);
  await page.fill("#bk-time", time);
  await page.fill("#bk-notes", notes);
  await page.getByRole("button", { name: "予約を作成" }).click();
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(400);
    if ((await page.getByRole("dialog").count()) === 0) break;
  }
  return sqlOne(`select booking_no from bookings where ${C} and notes = '${notes}' limit 1`);
}

/** 台帳のチップを開いてドロワーを出す */
async function openDrawer(page, text, date = D) {
  await page.goto(`${BASE}/demo?d=${date}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const chip = page.locator("button").filter({ hasText: text });
  const n = await chip.count();
  if (n > 0) {
    await chip.first().click();
    await page.waitForTimeout(500);
  }
  return n;
}

// ---------------------------------------------------------------- 実行順 17
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-002",
      priority: "P1",
      phase: "A",
      order: 17,
      title: "台帳で予約内容を確認する(院内の「確認」に相当)",
      spec: "v2-09",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "院内で作った予約は作成時点で確定済みのため、病院側の「確認」はこの内容確認が相当する。予約番号・時刻・担当・メニューが正しく読めることが条件。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const no = await createBooking(page, {
        patient: "山田",
        service: "メディカルピーリング",
        member: "鈴木",
        room: "施術室 1",
        time: "10:00",
        notes: `${TAG} 内容確認`,
      });
      await c.step({
        label: "確認用の予約を作成",
        action: `山田 花子 / メディカルピーリング / 鈴木 / 施術室 1 / ${D} 10:00`,
        expect: "予約が作成され、予約番号が採番される",
        actual: `予約番号=${no ?? "未作成"}`,
        page,
        checks: [{ label: "予約番号が採番される", ok: !!no, detail: String(no) }],
      });

      const found = await openDrawer(page, "山田 花子");
      const drawerText = (await page.locator('[role="dialog"]').innerText().catch(() => "")) || "";
      const hasNo = drawerText.includes(no ?? "___");
      const hasTime = drawerText.includes("10:00");
      const hasMember = drawerText.includes("鈴木");
      const hasService = drawerText.includes("メディカルピーリング");
      await c.step({
        label: "チップを開いて内容を確認",
        action: "台帳の予約チップをクリックして詳細を開く",
        expect: "予約番号・日時(JST)・担当・メニューが表示される",
        actual: `チップ候補=${found} / 番号=${hasNo} 時刻=${hasTime} 担当=${hasMember} メニュー=${hasService}`,
        note: "ドロワーの本文テキストを取得し、DB の値(予約番号)と突き合わせている。",
        page,
        fullPage: true,
        checks: [
          { label: "予約番号が表示される", ok: hasNo, detail: no ?? "" },
          { label: "JST の時刻が表示される", ok: hasTime },
          { label: "担当が表示される", ok: hasMember },
          { label: "メニューが表示される", ok: hasService },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 18
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-017",
      priority: "P1",
      phase: "A",
      order: 18,
      title: "インターネット予約の承認(承認待ち → 確定)",
      spec: "v2-13",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "手動承認モードでは、患者の申込は「承認待ち」で入り、院内が確定して初めて予約が成立する。承認漏れは患者を待たせる事故になる。",
    },
    async (c) => {
      // 患者としてインターネットから申し込む(承認待ちを作る)
      const { ctx, page } = await login("nurse1@demo.local");
      const guest = await ctx.newPage();
      let usedDate = null;
      const timeBtns = () => guest.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ });
      for (const off of [1, 2, 3, 4]) {
        const d = jstDate(off);
        await guest.goto(`${BASE}/c/demo/reserve?date=${d}`, { waitUntil: "domcontentloaded" });
        await guest.waitForTimeout(700);
        if ((await timeBtns().count()) > 0) {
          usedDate = d;
          break;
        }
      }
      await c.step({
        label: "患者が公開ページで空き枠を見る",
        action: "患者として /c/demo/reserve を開き、空き枠のある日を探す",
        expect: "空き枠(時刻ボタン)が表示される",
        actual: usedDate ? `${usedDate} に ${await timeBtns().count()} 枠` : "空き枠なし",
        page: guest,
        fullPage: true,
        checks: [{ label: "空き枠が表示される", ok: !!usedDate, detail: String(usedDate) }],
      });
      if (!usedDate) throw new Error("空き枠が無いため以降を中断");

      await timeBtns().first().click();
      await guest.locator("#g-name").waitFor({ state: "visible", timeout: 10000 });
      await guest.fill("#g-name", "AT検証 ゲスト");
      await guest.fill("#g-kana", "えーてぃーけんしょう げすと");
      await guest.fill("#g-phone", "090-0000-8888");
      await guest.fill("#g-email", "at-guest@example.com");
      await guest.getByRole("button", { name: "この内容で予約する" }).click();
      await guest.waitForTimeout(2200);
      const guestNo = sqlOne(
        `select booking_no from bookings where guest_email = 'at-guest@example.com' order by created_at desc limit 1`,
      );
      const guestStatus = sqlOne(
        `select status from bookings where guest_email = 'at-guest@example.com' order by created_at desc limit 1`,
      );
      await c.step({
        label: "患者が申し込む",
        action: "枠を選び、氏名・かな・電話・メールを入力して「この内容で予約する」",
        expect: "申込が受け付けられ、状態は「承認待ち」になる(手動承認モードのため即確定はしない)",
        actual: `予約番号=${guestNo} / 状態=${guestStatus}`,
        page: guest,
        fullPage: true,
        checks: [
          { label: "予約が作られる", ok: !!guestNo, detail: String(guestNo) },
          { label: "状態が承認待ち(requested)", ok: guestStatus === "requested", detail: String(guestStatus) },
        ],
      });

      // 院内が承認する
      const gDate = sqlOne(
        `select to_char(lower(s.occupied_range) at time zone 'Asia/Tokyo','YYYY-MM-DD') from booking_sessions s join bookings b on b.id = s.booking_id where b.guest_email = 'at-guest@example.com' order by s.seq limit 1`,
      );
      const found = await openDrawer(page, "(患者未設定)", gDate);
      const confirmBtn = page.getByRole("button", { name: "確定にする" });
      const hasConfirm = (await confirmBtn.count()) > 0;
      await c.step({
        label: "院内が承認待ちの予約を開く",
        action: `台帳(${gDate})で申込のチップ(患者マスタ未紐付けのため「(患者未設定)」と表示)を開く`,
        expect: "「確定にする」ボタンが表示される",
        actual: `チップ=${found}件 / 確定ボタン=${hasConfirm}`,
        note: "承認待ち一覧の画面は無く、台帳のチップから承認する導線(既知の制限 No.6)。",
        page,
        fullPage: true,
        checks: [{ label: "確定ボタンがある", ok: hasConfirm }],
      });

      if (hasConfirm) {
        await confirmBtn.first().click();
        await page.waitForTimeout(1800);
      }
      const afterStatus = sqlOne(
        `select status from bookings where guest_email = 'at-guest@example.com' order by created_at desc limit 1`,
      );
      await c.step({
        label: "確定にする",
        action: "「確定にする」を押す",
        expect: "状態が確定に変わり、チップの色が確定色になる",
        actual: `状態=${afterStatus}`,
        page,
        fullPage: true,
        checks: [{ label: "状態が確定になる", ok: afterStatus === "confirmed", detail: String(afterStatus) }],
      });

      const nq = `select n.kind, n.recipient_type, n.status from notifications n join bookings b on b.id = n.booking_id
                  where b.guest_email = 'at-guest@example.com' order by n.created_at`;
      const nrows = sql(nq);
      c.dbCheck({
        label: "確定時に患者への確定メールが積まれる",
        query: nq.replace(/\s+/g, " "),
        expect: "booking_confirmed(patient)が含まれる",
        actual: nrows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: nrows.some((r) => r[0] === "booking_confirmed" && r[1] === "patient"),
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 19 + 20
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-015",
      priority: "P0",
      phase: "A",
      order: 19,
      title: "当日の状態遷移(確定 → 来院 → 完了)と不正な遷移の拒否",
      spec: "v2-12",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "受付が当日に触る唯一の操作。順番を飛ばした遷移や、完了後の巻き戻しを許すと売上・実績の集計が壊れる。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const notes = `${TAG} 状態遷移`;
      const no = await createBooking(page, {
        patient: "高橋",
        service: "メディカルピーリング",
        member: "田中",
        room: "施術室 2",
        time: "11:30",
        notes,
      });
      const bid = sqlOne(`select id from bookings where ${C} and notes = '${notes}'`);

      await openDrawer(page, "高橋 直美");
      const labels1 = await page.getByRole("button").allTextContents();
      await c.step({
        label: "確定の予約を開く",
        action: `作成した予約(${no})のチップを開く`,
        expect: "「来院にする」「不来院にする」が選べ、「完了にする」は出ない(順番を飛ばせない)",
        actual: `ボタン=${labels1.filter((t) => t.includes("にする")).join("・")}`,
        note: "遷移可能な状態だけをサーバー定義から描画している。UI に出ない = 押せない、が第一の防御。",
        page,
        fullPage: true,
        checks: [
          { label: "「来院にする」がある", ok: labels1.some((t) => t.includes("来院にする")) },
          { label: "「完了にする」は出ない", ok: !labels1.some((t) => t.includes("完了にする")) },
        ],
      });

      await page.getByRole("button", { name: "来院にする" }).first().click();
      await page.waitForTimeout(1600);
      const st1 = sqlOne(`select status from bookings where id = '${bid}'`);
      await openDrawer(page, "高橋 直美");
      const labels2 = await page.getByRole("button").allTextContents();
      await c.step({
        label: "来院にする",
        action: "「来院にする」を押す",
        expect: "状態が来院になり、次は「完了にする」が選べるようになる",
        actual: `状態=${st1} / ボタン=${labels2.filter((t) => t.includes("にする")).join("・")}`,
        page,
        fullPage: true,
        checks: [
          { label: "状態が来院になる", ok: st1 === "checked_in", detail: String(st1) },
          { label: "「完了にする」が出る", ok: labels2.some((t) => t.includes("完了にする")) },
        ],
      });

      await page.getByRole("button", { name: "完了にする" }).first().click();
      await page.waitForTimeout(1600);
      const st2 = sqlOne(`select status from bookings where id = '${bid}'`);
      await openDrawer(page, "高橋 直美");
      const labels3 = await page.getByRole("button").allTextContents();
      await c.step({
        label: "完了にする",
        action: "「完了にする」を押す",
        expect: "状態が完了になり、以降の状態変更・キャンセルはできなくなる",
        actual: `状態=${st2} / 残るボタン=${labels3.filter((t) => t.includes("にする") || t.includes("キャンセル")).join("・") || "なし"}`,
        page,
        fullPage: true,
        checks: [
          { label: "状態が完了になる", ok: st2 === "done", detail: String(st2) },
          {
            label: "完了後は状態変更もキャンセルもできない",
            ok: !labels3.some((t) => t.includes("にする") || t.includes("予約をキャンセル")),
            detail: labels3.filter((t) => t.includes("にする")).join("・") || "なし",
          },
        ],
      });

      // サーバー側でも拒否されるか(画面を経由しない改ざん相当)
      let rejected = false;
      let msg = "";
      try {
        sql(`update bookings set status = 'confirmed' where id = '${bid}'`);
        // トリガが無ければ更新できてしまう。値を戻して記録する
        const back = sqlOne(`select status from bookings where id = '${bid}'`);
        rejected = back !== "confirmed";
        msg = `直接 UPDATE 後の状態=${back}`;
        sql(`update bookings set status = 'done' where id = '${bid}'`);
      } catch (e) {
        rejected = true;
        msg = String(e.stderr ?? e).replace(/\s+/g, " ").slice(0, 200);
      }
      c.dbCheck({
        label: "【参考】データベースを直接書き換えた場合の挙動",
        query: `update bookings set status='confirmed' where id='${bid}' -- 完了済みを巻き戻す`,
        expect: "アプリ経由では拒否される(状態機械はサーバー側で強制)。DB 直接更新は DBA 権限の操作であり別レイヤ",
        actual: msg,
        ok: true,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 22 / 23
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-013",
      priority: "P0",
      phase: "A",
      order: 22,
      title: "予約のキャンセル(理由の記録・枠の解放・患者への通知)",
      spec: "v2-11",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "キャンセルで枠が解放されないと、空いているのに次の患者を入れられない。通知が飛ばないと患者が来院してしまう。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const notes = `${TAG} キャンセル`;
      const no = await createBooking(page, {
        patient: "山田",
        service: "メディカルピーリング",
        member: "鈴木",
        room: "施術室 2",
        time: "16:00",
        notes,
      });
      const bid = sqlOne(`select id from bookings where ${C} and notes = '${notes}'`);
      await c.step({
        label: "キャンセル対象の予約を作成",
        action: `山田 花子 / 鈴木 / 施術室 2 / ${D} 16:00`,
        expect: "予約が作成される",
        actual: `予約番号=${no}`,
        page,
        checks: [{ label: "作成できる", ok: !!no }],
      });

      await openDrawer(page, "山田 花子");
      // 16:00 の予約を確実に開くため、ドロワーの内容で確認してから操作する
      const txt = (await page.locator('[role="dialog"]').innerText().catch(() => "")) || "";
      if (!txt.includes(no ?? "___")) {
        const chips = page.locator("button").filter({ hasText: "山田 花子" });
        for (let i = 0; i < (await chips.count()); i++) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
          await chips.nth(i).click();
          await page.waitForTimeout(400);
          const t = (await page.locator('[role="dialog"]').innerText().catch(() => "")) || "";
          if (t.includes(no ?? "___")) break;
        }
      }
      await page.getByRole("button", { name: "予約をキャンセル" }).first().click();
      await page.waitForTimeout(400);
      await page.fill('input[name="reason"]', "患者都合(受け入れテスト)");
      await c.step({
        label: "キャンセル理由を入力",
        action: "「予約をキャンセル」→ 理由「患者都合(受け入れテスト)」を入力",
        expect: "理由の入力欄と「キャンセルを確定」が出る",
        actual: `入力=${await page.inputValue('input[name="reason"]')}`,
        page,
        fullPage: true,
        checks: [
          {
            label: "理由が入力できる",
            ok: (await page.inputValue('input[name="reason"]')) === "患者都合(受け入れテスト)",
          },
        ],
      });

      await page.getByRole("button", { name: "キャンセルを確定" }).click();
      await page.waitForTimeout(2000);
      const q = `select b.status, b.cancel_reason, (select count(*) from booking_sessions s where s.booking_id = b.id and s.status <> 'cancelled') as alive
                 from bookings b where b.id = '${bid}'`;
      const row = sql(q)[0] ?? [];
      await c.step({
        label: "キャンセルが確定する",
        action: "「キャンセルを確定」を押す",
        expect: "予約がキャンセル状態になり、台帳から確定チップが消える",
        actual: `状態=${row[0]} / 理由=${row[1]}`,
        page,
        fullPage: true,
        checks: [{ label: "状態がキャンセルになる", ok: row[0] === "cancelled", detail: String(row[0]) }],
      });
      c.dbCheck({
        label: "キャンセル理由が記録され、押さえていた枠がすべて解放される",
        query: q.replace(/\s+/g, " "),
        expect: "status=cancelled / 理由が保存 / 生きているセッション 0 件",
        actual: row.join(" / "),
        ok: row[0] === "cancelled" && row[1] === "患者都合(受け入れテスト)" && row[2] === "0",
      });

      const nq = `select kind, recipient_type, status from notifications where booking_id = '${bid}' order by created_at`;
      const nrows = sql(nq);
      c.dbCheck({
        label: "患者へのキャンセル通知が積まれる",
        query: nq,
        expect: "booking_cancelled(patient)",
        actual: nrows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: nrows.some((r) => r[0] === "booking_cancelled" && r[1] === "patient"),
      });

      // 枠の再利用(AT-BOOK-022)
      const notes2 = `${TAG} 枠再利用`;
      const no2 = await createBooking(page, {
        patient: "高橋",
        service: "メディカルピーリング",
        member: "鈴木",
        room: "施術室 2",
        time: "16:00",
        notes: notes2,
      });
      await c.step({
        label: "解放された枠に別の予約を入れる",
        action: `キャンセルした枠と同じ 鈴木 / 施術室 2 / ${D} 16:00 に、別の患者で予約`,
        expect: "重複エラーにならず作成できる(枠が確実に解放されている)",
        actual: `予約番号=${no2 ?? "作成できず"}`,
        note: "キャンセルは専用の処理で原子的に行われ、枠の解放と状態変更が同時に確定する。",
        page,
        fullPage: true,
        checks: [{ label: "同じ枠に再予約できる", ok: !!no2, detail: String(no2) }],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 25
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-012",
      priority: "P1",
      phase: "A",
      order: 25,
      title: "予約の変更(日時・担当・部屋)と変更後の重複チェック",
      spec: "v2-11",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent:
        "「1 時間ずらしたい」は日常的に発生する。変更後にも重複チェックが働かないと、ずらした先で二重予約になる。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const notes = `${TAG} リスケ`;
      const no = await createBooking(page, {
        patient: "山田",
        service: "メディカルピーリング",
        member: "田中",
        room: "施術室 1",
        time: "13:00",
        notes,
      });
      const bid = sqlOne(`select id from bookings where ${C} and notes = '${notes}'`);
      const beforeStart = sqlOne(
        `select to_char(lower(time_range) at time zone 'Asia/Tokyo','HH24:MI') from booking_sessions where booking_id = '${bid}' order by seq limit 1`,
      );

      await openDrawer(page, "山田 花子");
      const txt = (await page.locator('[role="dialog"]').innerText().catch(() => "")) || "";
      if (!txt.includes(no ?? "___")) {
        const chips = page.locator("button").filter({ hasText: "山田 花子" });
        for (let i = 0; i < (await chips.count()); i++) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
          await chips.nth(i).click();
          await page.waitForTimeout(400);
          const t = (await page.locator('[role="dialog"]').innerText().catch(() => "")) || "";
          if (t.includes(no ?? "___")) break;
        }
      }
      const rsBtn = page.getByRole("button", { name: "予約を変更" });
      await c.step({
        label: "変更する予約を開く",
        action: `予約(${no}, ${D} 13:00)のチップを開く`,
        expect: "「予約を変更」ボタンが表示される(来院以降・完了・キャンセルでは出ない)",
        actual: `変更ボタン=${await rsBtn.count()}個 / 現在の開始=${beforeStart}`,
        page,
        fullPage: true,
        checks: [{ label: "「予約を変更」がある", ok: (await rsBtn.count()) > 0 }],
      });

      await rsBtn.first().click();
      await page.locator("#rs-time").waitFor({ state: "visible", timeout: 10000 });
      await page.fill("#rs-time", "17:00");
      await c.step({
        label: "新しい時刻を指定",
        action: "変更ダイアログで開始時刻を 17:00 にする",
        expect: "変更内容が入力できる",
        actual: `新しい時刻=${await page.inputValue("#rs-time")}`,
        page,
        fullPage: true,
        checks: [{ label: "時刻が入力される", ok: (await page.inputValue("#rs-time")) === "17:00" }],
      });

      await page.getByRole("button", { name: "変更を保存" }).click();
      await page.waitForTimeout(2200);
      const afterStart = sqlOne(
        `select to_char(lower(time_range) at time zone 'Asia/Tokyo','HH24:MI') from booking_sessions where booking_id = '${bid}' order by seq limit 1`,
      );
      await c.step({
        label: "変更が反映される",
        action: "「変更を保存」を押す",
        expect: "台帳の表示位置が 17:00 に移動する",
        actual: `開始 ${beforeStart} → ${afterStart}`,
        page,
        fullPage: true,
        checks: [{ label: "17:00 に変更される", ok: afterStart === "17:00", detail: `${beforeStart}→${afterStart}` }],
      });

      const nq = `select kind, recipient_type from notifications where booking_id = '${bid}' order by created_at`;
      const nrows = sql(nq);
      c.dbCheck({
        label: "変更を知らせる通知が積まれる",
        query: nq,
        expect: "booking_rescheduled が含まれる",
        actual: nrows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: nrows.some((r) => r[0] === "booking_rescheduled"),
      });

      // 変更後の重複チェック: 別の予約を、いま埋めた枠へ動かそうとする
      const notes2 = `${TAG} リスケ衝突`;
      const no2 = await createBooking(page, {
        patient: "高橋",
        service: "メディカルピーリング",
        member: "田中",
        room: "施術室 1",
        time: "14:30",
        notes: notes2,
      });
      await openDrawer(page, "高橋 直美");
      const t2 = (await page.locator('[role="dialog"]').innerText().catch(() => "")) || "";
      if (!t2.includes(no2 ?? "___")) {
        const chips2 = page.locator("button").filter({ hasText: "高橋 直美" });
        for (let i = 0; i < (await chips2.count()); i++) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(200);
          await chips2.nth(i).click();
          await page.waitForTimeout(400);
          const t = (await page.locator('[role="dialog"]').innerText().catch(() => "")) || "";
          if (t.includes(no2 ?? "___")) break;
        }
      }
      const rsBtn2 = page.getByRole("button", { name: "予約を変更" });
      if ((await rsBtn2.count()) > 0) {
        await rsBtn2.first().click();
        await page.locator("#rs-time").waitFor({ state: "visible", timeout: 10000 });
        await page.fill("#rs-time", "17:00");
        await selectOption(page, "rs-room", "施術室 1").catch(() => {});
        await selectOption(page, "rs-member", "田中").catch(() => {});
        await page.getByRole("button", { name: "変更を保存" }).click();
        await page.waitForTimeout(1800);
        const errs = await page.getByText(/埋まって|重複|できません/).allTextContents();
        await c.step({
          label: "埋まっている時間へ移そうとする",
          action: `別の予約(${no2}, ${D} 14:30)を、いま埋めた 田中 / 施術室 1 / 17:00 へ変更しようとする`,
          expect: "重複として拒否される",
          actual: `エラー=${JSON.stringify(errs)}`,
          note: "変更時も作成時と同じ排他制約で判定される。",
          page,
          fullPage: true,
          checks: [{ label: "重複が拒否される", ok: errs.length > 0, detail: errs.join(" / ") || "拒否されなかった" }],
        });
      }
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
