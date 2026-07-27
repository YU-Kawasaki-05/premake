// フェーズ B ④ 予約の照会・キャンセル・指名・未実装項目の実測
// AT-PUB-023 / 024 / 025 / 026 / 028 / 020 / 021 / 022 / 018 / 019
// 実行: node scripts/at-evidence/phase-b-04-manage.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  anonContext,
  closeBrowser,
  jstDate,
  runCase,
  sql,
  sqlOne,
  summarize,
} from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];
const REF = ["20_受け入れテスト/05_公開予約.md"];
const EMAIL = "at-pub@example.com"; // フェーズ B③ で申し込んだ予約
const CANCEL_DEADLINE_H = Number(
  sqlOne(`select cancel_deadline_hours from clinics where id = '${DEMO_CLINIC_ID}'`),
);

const SERVICE_ID = sqlOne(`select id from services where ${C} and name = 'メディカルピーリング'`);

/**
 * 照会・キャンセルの検証に使うゲスト予約を、キャンセル期限より十分先の枠に作る。
 * (期限ギリギリの枠だと「期限切れで拒否」が正しく起きてしまい、正常系の検証にならない)
 */
async function ensureGuestBooking() {
  const existing = sql(
    `select b.booking_no, b.id from bookings b
     join booking_sessions s on s.booking_id = b.id
     where b.guest_email = '${EMAIL}' and b.status <> 'cancelled'
       and lower(s.time_range) > now() + interval '${CANCEL_DEADLINE_H + 6} hour'
     order by b.created_at desc limit 1`,
  )[0];
  if (existing) return existing;

  sql(`delete from booking_access_tokens where booking_id in (select id from bookings where guest_email = '${EMAIL}')`);
  sql(`delete from notifications where booking_id in (select id from bookings where guest_email = '${EMAIL}')`);
  sql(`delete from booking_sessions where booking_id in (select id from bookings where guest_email = '${EMAIL}')`);
  sql(`delete from bookings where guest_email = '${EMAIL}'`);

  const { ctx, page } = await anonContext();
  const timeBtns = () => page.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ });
  let done = false;
  for (const off of [2, 3, 4, 5]) {
    const d = jstDate(off);
    await page.goto(`${BASE}/c/demo/reserve?service=${SERVICE_ID}&date=${d}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    if ((await timeBtns().count()) === 0) continue;
    await timeBtns().first().click();
    await page.locator("#g-name").waitFor({ state: "visible", timeout: 10000 });
    await page.fill("#g-name", "AT照会 患者");
    await page.fill("#g-kana", "えーてぃーしょうかい かんじゃ");
    await page.fill("#g-phone", "090-1111-2222");
    await page.fill("#g-email", EMAIL);
    await page.getByRole("button", { name: "この内容で予約する" }).click();
    await page.waitForTimeout(2500);
    done = true;
    break;
  }
  await ctx.close();
  if (!done) throw new Error("キャンセル期限より先の空き枠が見つからない");
  const row = sql(
    `select booking_no, id from bookings where guest_email = '${EMAIL}' order by created_at desc limit 1`,
  )[0];
  if (!row) throw new Error("前提のゲスト予約を作成できなかった");
  return row;
}

const [BOOKING_NO, BOOKING_ID] = await ensureGuestBooking();

/** 照会フォームから管理画面へ入る */
async function lookup(page, { no, email }) {
  await page.goto(`${BASE}/c/demo/lookup`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.fill("#lk-no", no);
  await page.fill("#lk-email", email);
  await page.getByRole("button", { name: /照会|確認|検索/ }).first().click();
  await page.waitForTimeout(2000);
  return page.url().replace(BASE, "");
}

// ---------------------------------------------------------------- AT-PUB-023
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-023",
      priority: "P0",
      phase: "B",
      order: 123,
      title: "患者が予約番号とメールアドレスで自分の予約を照会する",
      spec: "v2-22",
      refs: REF,
      intent:
        "患者がログインなしで自分の予約を確認・キャンセルするための入口。ここが使えないと問い合わせが電話に集中する。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await page.goto(`${BASE}/c/demo/lookup`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      await c.step({
        label: "照会ページを開く",
        action: "公開ページの「予約の確認・変更・キャンセルはこちら」から /c/demo/lookup を開く",
        expect: "予約番号とメールアドレスの入力欄がある",
        actual: `番号欄=${await page.locator("#lk-no").count()} / メール欄=${await page.locator("#lk-email").count()}`,
        page,
        fullPage: true,
        checks: [
          { label: "予約番号の入力欄がある", ok: (await page.locator("#lk-no").count()) > 0 },
          { label: "メールアドレスの入力欄がある", ok: (await page.locator("#lk-email").count()) > 0 },
        ],
      });

      const url = await lookup(page, { no: BOOKING_NO, email: EMAIL });
      const body = await page.locator("body").innerText();
      await c.step({
        label: "正しい組み合わせで照会",
        action: `予約番号 ${BOOKING_NO} と ${EMAIL} を入力して照会`,
        expect: "自分の予約の管理画面が開き、日時とメニューが表示される",
        actual: `遷移先=${url} / 予約番号の表示=${body.includes(BOOKING_NO)}`,
        note: "管理画面の URL には推測できないトークンが入る(番号だけでは開けない)。",
        page,
        fullPage: true,
        checks: [
          { label: "管理画面へ遷移する", ok: url.includes("/manage/"), detail: url },
          { label: "予約番号が表示される", ok: body.includes(BOOKING_NO) },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-024
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-024",
      priority: "P0",
      phase: "B",
      order: 124,
      title: "他人の予約は照会できない(組み合わせが違えば開かない)",
      spec: "v2-22",
      refs: REF,
      intent:
        "予約番号だけ、あるいはメールだけを知っている第三者に予約内容を見せてはいけない。総当たりの手がかりも与えないこと。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const url1 = await lookup(page, { no: BOOKING_NO, email: "someone-else@example.com" });
      const body1 = await page.locator("body").innerText();
      await c.step({
        label: "正しい番号 + 違うメールアドレス",
        action: `予約番号 ${BOOKING_NO} に、無関係のメールアドレスを組み合わせて照会`,
        expect: "管理画面は開かず、予約の存在も分からない応答になる",
        actual: `遷移先=${url1} / 画面=「${body1.slice(0, 70).replace(/\s+/g, " ")}」`,
        note: "「番号は合っているがメールが違う」と分かる応答を返すと、番号の総当たりを助けてしまう。",
        page,
        fullPage: true,
        checks: [
          { label: "管理画面へ遷移しない", ok: !url1.includes("/manage/"), detail: url1 },
          { label: "予約内容が表示されない", ok: !body1.includes("メディカルピーリング") },
        ],
      });

      const url2 = await lookup(page, { no: "B-999999-XXXX", email: EMAIL });
      const body2 = await page.locator("body").innerText();
      await c.step({
        label: "存在しない番号 + 正しいメールアドレス",
        action: "存在しない予約番号で照会",
        expect: "同じように開かない。応答の違いから存在の有無を推測できない",
        actual: `遷移先=${url2} / 画面=「${body2.slice(0, 70).replace(/\s+/g, " ")}」`,
        page,
        fullPage: true,
        checks: [
          { label: "管理画面へ遷移しない", ok: !url2.includes("/manage/"), detail: url2 },
          {
            label: "存在する番号のときと同じ応答になる(存在を漏らさない)",
            ok: body1.slice(0, 120) === body2.slice(0, 120),
            detail: body1.slice(0, 120) === body2.slice(0, 120) ? "同一の応答" : "応答が異なる",
          },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-028
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-028",
      priority: "P0",
      phase: "B",
      order: 128,
      title: "推測した管理リンクでは開けない(トークンの検証)",
      spec: "v2-22",
      refs: REF,
      intent:
        "管理画面の URL はメールに載る。URL の一部を書き換えて他人の予約を開けないこと、トークンが平文で保存されていないこと。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const res = await page.goto(`${BASE}/c/demo/manage/0123456789abcdef0123456789abcdef`, {
        waitUntil: "domcontentloaded",
      });
      const body = await page.locator("body").innerText();
      await c.step({
        label: "でたらめなトークンで管理画面を開く",
        action: "/c/demo/manage/<でたらめな文字列> を直接開く",
        expect: "404 になり、予約内容は出ない",
        actual: `HTTP ${res?.status()} / 画面=「${body.slice(0, 60).replace(/\s+/g, " ")}」`,
        page,
        checks: [
          { label: "開けない", ok: res?.status() === 404 || !body.includes(BOOKING_NO), detail: `HTTP ${res?.status()}` },
        ],
      });

      const q = `select token_hash is not null as hashed, length(token_hash) as len, expires_at > now() as valid, purpose
                 from booking_access_tokens where booking_id = '${BOOKING_ID}' limit 1`;
      let row = [];
      try {
        row = sql(q)[0] ?? [];
      } catch (e) {
        row = [String(e.stderr ?? e).slice(0, 80)];
      }
      c.dbCheck({
        label: "トークンは平文ではなくハッシュで保存され、有効期限がある",
        query: q.replace(/\s+/g, " "),
        expect: "ハッシュ値(64 文字の SHA-256)が保存され、期限が未来",
        actual: row.join(" / ") || "なし",
        ok: row[0] === "t" && Number(row[1]) === 64 && row[2] === "t",
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-025 / 026
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-025",
      priority: "P0",
      phase: "B",
      order: 125,
      title: "患者が自分でキャンセルでき、枠が解放される",
      spec: "v2-22",
      refs: REF,
      intent:
        "電話をかけずにキャンセルできること。キャンセルされた枠がすぐ他の患者に開放され、院内にも通知が届くこと。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await lookup(page, { no: BOOKING_NO, email: EMAIL });
      const body = await page.locator("body").innerText();
      const deadlineShown = body.includes(String(CANCEL_DEADLINE_H));
      await c.step({
        label: "管理画面を開く",
        action: `予約番号 ${BOOKING_NO} で管理画面に入る`,
        expect: `キャンセルの入口と、キャンセル期限(${CANCEL_DEADLINE_H} 時間前まで)の案内がある`,
        actual: `キャンセルボタン=${await page.getByRole("button", { name: "予約をキャンセル" }).count()}個 / 期限の記載=${deadlineShown}`,
        page,
        fullPage: true,
        checks: [
          {
            label: "キャンセルの入口がある",
            ok: (await page.getByRole("button", { name: "予約をキャンセル" }).count()) > 0,
          },
          { label: "キャンセル期限が案内されている", ok: deadlineShown, detail: `${CANCEL_DEADLINE_H} 時間` },
        ],
      });

      await page.getByRole("button", { name: "予約をキャンセル" }).first().click();
      await page.waitForTimeout(500);
      await c.step({
        label: "確認を求められる",
        action: "「予約をキャンセル」を押す",
        expect: "いきなり実行されず、確認のステップが入る",
        actual: `確認の表示=${(await page.getByText(/キャンセルしますか/).count()) > 0}`,
        page,
        fullPage: true,
        checks: [
          { label: "確認ステップがある", ok: (await page.getByText(/キャンセルしますか/).count()) > 0 },
        ],
      });

      await page.getByRole("button", { name: "キャンセルする" }).first().click();
      await page.waitForTimeout(2500);
      const after = sql(
        `select status, (select count(*) from booking_sessions s where s.booking_id = b.id and s.status <> 'cancelled') from bookings b where b.id = '${BOOKING_ID}'`,
      )[0] ?? [];
      const bodyAfter = await page.locator("body").innerText();
      await c.step({
        label: "キャンセルが完了する",
        action: "「キャンセルする」で確定",
        expect: "キャンセル済みの表示になり、枠が解放される",
        actual: `画面=「${bodyAfter.slice(0, 60).replace(/\s+/g, " ")}」 / DB: status=${after[0]} 生きている枠=${after[1]}`,
        page,
        fullPage: true,
        checks: [
          { label: "状態がキャンセルになる", ok: after[0] === "cancelled", detail: String(after[0]) },
          { label: "押さえていた枠が解放される", ok: after[1] === "0", detail: `${after[1]} 件` },
        ],
      });

      const nq = `select kind, recipient_type from notifications where booking_id = '${BOOKING_ID}' order by created_at`;
      const nrows = sql(nq);
      c.dbCheck({
        label: "患者と院内の双方に通知が積まれる",
        query: nq,
        expect: "booking_cancelled(patient) と booking_cancelled_internal(member)",
        actual: nrows.map((r) => r.join(":")).join(" / ") || "なし",
        ok:
          nrows.some((r) => r[0] === "booking_cancelled" && r[1] === "patient") &&
          nrows.some((r) => r[0] === "booking_cancelled_internal" && r[1] === "member"),
      });
      const aq = `select action, actor_type from audit_logs where ${C} and action like '%guest_cancel%' order by created_at desc limit 1`;
      const arow = sql(aq)[0] ?? [];
      c.dbCheck({
        label: "患者によるキャンセルが監査ログに残る",
        query: aq,
        expect: "booking.guest_cancel / actor_type=guest",
        actual: arow.join(" / ") || "なし",
        ok: arow[0]?.includes("guest_cancel") && arow[1] === "guest",
      });
      await ctx.close();
    },
  ),
);

verdicts.push(
  await runCase(
    {
      id: "AT-PUB-026",
      priority: "P1",
      phase: "B",
      order: 126,
      title: "キャンセル期限を過ぎた予約は患者側でキャンセルできない",
      spec: "v2-22",
      refs: REF,
      intent:
        "直前キャンセルを電話に誘導し、クリニックが状況を把握できるようにするための制限。設定した時間(現在 " +
        CANCEL_DEADLINE_H +
        " 時間前)より後は画面から操作できないこと。",
      notes:
        "期限切れの状態を作るため、検証用の予約を「いまから数時間後」に作成している(通常の操作では作れない状況)。",
    },
    async (c) => {
      const email3 = "at-pub-deadline@example.com";
      sql(`delete from booking_sessions where booking_id in (select id from bookings where guest_email = '${email3}')`);
      sql(`delete from notifications where booking_id in (select id from bookings where guest_email = '${email3}')`);
      sql(`delete from booking_access_tokens where booking_id in (select id from bookings where guest_email = '${email3}')`);
      sql(`delete from bookings where guest_email = '${email3}'`);

      // 期限内(24h 後)と期限外(2h 後)の 2 件を用意する
      const svc = sqlOne(`select id from services where ${C} and name = 'メディカルピーリング'`);
      const room = sqlOne(`select id from rooms where ${C} and name = '施術室 2'`);
      const member = sqlOne(
        `select m.id from clinic_members m join staff_service_assignments a on a.member_id = m.id and a.service_id = '${svc}' where m.${C} and m.is_bookable limit 1`,
      );
      const mk = (hoursAhead, no) => {
        const bid = sqlOne(
          `insert into bookings (clinic_id, booking_no, service_id, status, source, guest_name, guest_email, guest_phone)
           values ('${DEMO_CLINIC_ID}', '${no}', '${svc}', 'confirmed', 'web', 'AT期限 検証', '${email3}', '090-5555-6666') returning id`,
        );
        sql(
          `insert into booking_sessions (booking_id, clinic_id, seq, kind, room_id, member_id, time_range, occupied_range, status)
           values ('${bid}', '${DEMO_CLINIC_ID}', 1, 'procedure', '${room}', '${member}',
                   tstzrange(now() + interval '${hoursAhead} hour', now() + interval '${hoursAhead} hour' + interval '45 min'),
                   tstzrange(now() + interval '${hoursAhead} hour', now() + interval '${hoursAhead} hour' + interval '55 min'), 'scheduled')`,
        );
        // 管理トークン(平文は検証用に固定。実運用ではランダム生成 + ハッシュ保存)
        const plain = `at-deadline-${hoursAhead}h-token-0000000000`;
        sql(
          `insert into booking_access_tokens (booking_id, token_hash, purpose, expires_at)
           values ('${bid}', encode(digest('${plain}','sha256'),'hex'), 'manage', now() + interval '30 day')`,
        );
        return { bid, plain };
      };
      const soon = mk(2, "B-AT0001-SOON"); // 2 時間後 = 期限外
      const later = mk(48, "B-AT0002-LATE"); // 48 時間後 = 期限内

      const { ctx, page } = await anonContext();
      await page.goto(`${BASE}/c/demo/manage/${later.plain}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const laterBtn = await page.getByRole("button", { name: "予約をキャンセル" }).count();
      await c.step({
        label: "期限内(48 時間後)の予約",
        action: "48 時間後の予約の管理画面を開く",
        expect: `キャンセルの操作ができる(期限は ${CANCEL_DEADLINE_H} 時間前まで)`,
        actual: `キャンセルボタン=${laterBtn}個`,
        page,
        fullPage: true,
        checks: [{ label: "キャンセルできる", ok: laterBtn > 0 }],
      });

      await page.goto(`${BASE}/c/demo/manage/${soon.plain}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const soonBtn = await page.getByRole("button", { name: "予約をキャンセル" }).count();
      const soonBody = await page.locator("body").innerText();
      // 実際に押してみて、サーバー側で拒否されることまで確認する
      let serverRejected = false;
      let toastText = "";
      if (soonBtn > 0) {
        await page.getByRole("button", { name: "予約をキャンセル" }).first().click();
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: "キャンセルする" }).first().click();
        await page.waitForTimeout(2000);
        toastText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        serverRejected =
          sqlOne(`select status from bookings where id = '${soon.bid}'`) === "confirmed" &&
          /期限|過ぎ|ご連絡/.test(toastText);
      }
      await c.step({
        label: "期限外(2 時間後)の予約",
        action: "2 時間後に迫った予約の管理画面を開き、キャンセルを試みる",
        expect: "キャンセルできない。期限を過ぎている旨が案内される",
        actual: `キャンセルボタン=${soonBtn}個 / 押した結果=${serverRejected ? "サーバーが拒否" : "拒否されず"} / 画面=「${toastText.slice(0, 110)}」`,
        note: "ボタン自体は表示されるが、押すとサーバー側の期限チェックで拒否される(予約は確定のまま)。表示の出し分けは行われていない。",
        page,
        fullPage: true,
        checks: [
          {
            label: "期限外のキャンセルが成立しない",
            ok: serverRejected,
            detail: `予約の状態=${sqlOne(`select status from bookings where id = '${soon.bid}'`)}`,
          },
          {
            label: "期限を過ぎた旨が案内される",
            ok: /期限|過ぎ|ご連絡/.test(toastText),
            detail: toastText.slice(0, 90),
          },
        ],
      });
      if (soonBtn > 0) {
        c.partial(
          "キャンセル期限を過ぎていても「予約をキャンセル」ボタンは表示されます。押すとサーバー側で拒否され予約は変わりませんが、患者は操作してから断られることになります(表示の出し分けが未実装)。",
        );
        c.issue({
          severity: "low",
          status: "open",
          summary: "キャンセル期限を過ぎた予約でも、患者側にキャンセルボタンが表示される",
          detail:
            "管理画面は予約の状態(キャンセル済み・完了・来院)だけを見てボタンの出し分けをしており、キャンセル期限は見ていません。期限後に押すとサーバー側で拒否され「キャンセル期限(24時間前)を過ぎています」と表示されます。データは変わらないため安全性の問題はありません。",
          impact:
            "患者が操作してから断られるため、問い合わせの電話が増える可能性があります。データ不整合は起きません。",
          workaround:
            "画面側で最初のセッション開始時刻と期限を比較し、期限を過ぎていればボタンを出さずに連絡先を案内する(manage-booking-view.tsx の alreadyClosed の判定に期限を追加)。",
        });
      }

      sql(`delete from booking_access_tokens where booking_id in ('${soon.bid}','${later.bid}')`);
      sql(`delete from booking_sessions where booking_id in ('${soon.bid}','${later.bid}')`);
      sql(`delete from notifications where booking_id in ('${soon.bid}','${later.bid}')`);
      sql(`delete from bookings where id in ('${soon.bid}','${later.bid}')`);
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-020〜022
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-020",
      priority: "P1",
      phase: "B",
      order: 120,
      title: "担当スタッフの指名(指名を許可したメニューのみ・指定なしが既定)",
      spec: "v2-21",
      refs: REF,
      intent:
        "指名は集客上の要。ただし指名を受けないスタッフや、指名を許可していないメニューで指名欄が出てはいけない。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const allow = sql(
        `select name, allow_nomination from services where ${C} and is_public and status = 'active' order by sort_order`,
      );
      const withNom = allow.find((r) => r[1] === "t");
      const withoutNom = allow.find((r) => r[1] === "f");

      if (withNom) {
        const id = sqlOne(`select id from services where ${C} and name = '${withNom[0].replace(/'/g, "''")}'`);
        await page.goto(`${BASE}/c/demo/reserve?service=${id}&date=${jstDate(1)}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(900);
        const body = await page.locator("body").innerText();
        const bookable = sql(
          `select coalesce(nullif(m.display_name,''), p.full_name) from clinic_members m
           left join profiles p on p.id = m.user_id
           join staff_service_assignments a on a.member_id = m.id and a.service_id = '${id}'
           where m.${C} and m.status = 'active' and m.is_bookable = true`,
        ).map((r) => r[0]);
        await c.step({
          label: "指名を許可したメニュー",
          action: `「${withNom[0]}」の予約ページを開く`,
          expect: "「担当の指名(任意)」が表示され、指名可能なスタッフだけが並ぶ。既定は「指定なし」",
          actual: `指名欄=${body.includes("指名")} / 担当できるスタッフ=${bookable.join("・")}`,
          page,
          fullPage: true,
          checks: [
            { label: "指名欄が表示される", ok: body.includes("指名") },
            { label: "「指定なし」の選択肢がある", ok: /指定なし|おまかせ/.test(body) },
            {
              label: "担当割当のあるスタッフが選べる",
              ok: bookable.every((n) => body.includes(n.split(" ")[0])),
              detail: bookable.join("・"),
            },
          ],
        });
      }

      if (withoutNom) {
        const id2 = sqlOne(`select id from services where ${C} and name = '${withoutNom[0].replace(/'/g, "''")}'`);
        await page.goto(`${BASE}/c/demo/reserve?service=${id2}&date=${jstDate(1)}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(900);
        const body2 = await page.locator("body").innerText();
        await c.step({
          label: "指名を許可していないメニュー",
          action: `「${withoutNom[0]}」の予約ページを開く`,
          expect: "指名欄が表示されない",
          actual: `指名欄=${body2.includes("担当の指名")}`,
          page,
          fullPage: true,
          checks: [{ label: "指名欄が出ない", ok: !body2.includes("担当の指名") }],
        });
      } else {
        c.partial(
          "この環境のメニューはすべて指名を許可しているため、「指名を許可していないメニューで指名欄が出ない」ことは未確認です。",
        );
      }
      await ctx.close();
    },
  ),
);

verdicts.push(
  await runCase(
    {
      id: "AT-PUB-021",
      priority: "P1",
      phase: "B",
      order: 121,
      title: "指名すると、そのスタッフの枠だけが空き枠に出る",
      spec: "v2-21",
      refs: REF,
      intent:
        "指名したのに別のスタッフの枠が出ると、当日に「担当が違う」というトラブルになる。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      // 指名は「指名を許可した」メニューでのみ機能する
      const svcRow = sql(
        `select id, name from services where ${C} and allow_nomination = true and is_public and status = 'active' order by sort_order limit 1`,
      )[0];
      const svcId = svcRow[0];
      const svcName = svcRow[1];
      const spanMin = Number(
        sqlOne(
          `select (select sum((x->>'duration_min')::int + (x->>'buffer_min')::int) from jsonb_array_elements(session_template) x) from services where id = '${svcId}'`,
        ),
      );
      const d = jstDate(1);
      const members = sql(
        `select m.id, coalesce(nullif(m.display_name,''), p.full_name) from clinic_members m
         left join profiles p on p.id = m.user_id
         join staff_service_assignments a on a.member_id = m.id and a.service_id = '${svcId}'
         where m.${C} and m.status = 'active' and m.is_bookable = true`,
      );
      const slotsOf = async (memberId) => {
        const url = memberId
          ? `${BASE}/c/demo/reserve?service=${svcId}&date=${d}&member=${memberId}`
          : `${BASE}/c/demo/reserve?service=${svcId}&date=${d}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        const t = await page.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ }).allTextContents();
        return [...new Set(t.map((x) => x.trim()))].sort();
      };
      const all = await slotsOf(null);

      // 指名 UI から選択する(URL パラメータ名に依存しないよう画面操作で行う)
      await page.goto(`${BASE}/c/demo/reserve?service=${svcId}&date=${d}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const first = members[0];
      const nameShort = (first?.[1] ?? "").split(" ")[0];
      const nomBtn = page.getByRole("link", { name: nameShort, exact: false }).first();
      const canNominate = (await nomBtn.count()) > 0 && !!nameShort;
      if (canNominate) {
        await nomBtn.click();
        await page.waitForTimeout(1200);
      }
      const nominated = [
        ...new Set(
          (await page.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ }).allTextContents()).map((x) =>
            x.trim(),
          ),
        ),
      ].sort();

      // 期待値: 指名したスタッフの受付枠から計算した空き枠のみ
      const expectedForMember = sql(
        `select to_char(generate_series(lower(sb.time_range), upper(sb.time_range) - interval '${spanMin} min', interval '15 min') at time zone 'Asia/Tokyo','HH24:MI')
         from schedule_blocks sb
         where sb.${C} and sb.block_type = 'open' and sb.member_id = '${first?.[0]}'
           and sb.time_range && tstzrange('${d}T00:00:00+09:00','${d}T23:59:59+09:00')`,
      ).map((r) => r[0]);

      await c.step({
        label: `「${nameShort}」を指名する`,
        action: `メニュー「${svcName}」(所要 ${spanMin} 分)で、指名なしの空き枠(${all.length} 枠)を確認したうえで ${nameShort} を指名して再表示`,
        expect: "指名したスタッフの受付枠に由来する時刻だけが残る",
        actual: `指名なし=${all.length} 枠 / 指名後=${nominated.length} 枠(${nominated.slice(0, 6).join(",")}${nominated.length > 6 ? " …" : ""})`,
        note: "指名後の枠がすべて、そのスタッフの受付枠の範囲に収まっているかで判定している。",
        page,
        fullPage: true,
        checks: [
          { label: "指名操作ができる", ok: canNominate, detail: nameShort },
          {
            label: "指名後の枠がすべて当該スタッフの受付枠内にある",
            ok: nominated.length > 0 && nominated.every((t) => expectedForMember.includes(t)),
            detail: `対象外=${nominated.filter((t) => !expectedForMember.includes(t)).join(",") || "なし"}`,
          },
          { label: "指名で枠が絞られる(または同数)", ok: nominated.length <= all.length, detail: `${all.length}→${nominated.length}` },
        ],
      });
      await ctx.close();
    },
  ),
);

verdicts.push(
  await runCase(
    {
      id: "AT-PUB-022",
      priority: "P1",
      phase: "B",
      order: 122,
      title: "そのメニューを担当できないスタッフの枠は空き枠に出ない",
      spec: "v2-21",
      refs: REF,
      intent:
        "担当割当は「このスタッフはこの施術ができる」という定義。割当のないスタッフの枠が出ると、できない施術の予約が入る。",
      notes:
        "検証のため、担当割当を一時的に外して空き枠が消えることを確認し、終了後に元へ戻している。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const svcId = sqlOne(`select id from services where ${C} and name = 'メディカルピーリング'`);
      const d = jstDate(2);
      const shown = async () => {
        await page.goto(`${BASE}/c/demo/reserve?service=${svcId}&date=${d}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        const t = await page.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ }).allTextContents();
        return [...new Set(t.map((x) => x.trim()))];
      };
      const before = await shown();
      // その日の受付枠を持つスタッフの割当を外す
      const blockMember = sqlOne(
        `select distinct sb.member_id from schedule_blocks sb where sb.${C} and sb.block_type = 'open'
         and sb.time_range && tstzrange('${d}T00:00:00+09:00','${d}T23:59:59+09:00') limit 1`,
      );
      const removed = sql(
        `delete from staff_service_assignments where member_id = '${blockMember}' and service_id = '${svcId}' returning member_id`,
      );
      const after = await shown();
      await c.step({
        label: "担当割当を外すと枠が消える",
        action: "その日に受付枠を持つスタッフから、当該メニューの担当割当を外して再表示",
        expect: "そのスタッフの枠に由来する空き枠が消える",
        actual: `${before.length} → ${after.length} 枠(削除した割当=${removed.length} 件)`,
        note: "「担当割当を忘れると空き枠が 1 件も出ない」という運用上の落とし穴の裏返しでもある。",
        page,
        fullPage: true,
        checks: [
          { label: "割当を外すと空き枠が減る", ok: after.length < before.length, detail: `${before.length}→${after.length}` },
        ],
      });
      // 復元
      if (removed.length > 0) {
        sql(
          `insert into staff_service_assignments (clinic_id, member_id, service_id) values ('${DEMO_CLINIC_ID}','${blockMember}','${svcId}') on conflict do nothing`,
        );
      }
      const restored = await shown();
      await c.step({
        label: "割当を戻すと復活する",
        action: "担当割当を元に戻して再表示",
        expect: "空き枠が元の件数に戻る",
        actual: `${after.length} → ${restored.length} 枠(元: ${before.length} 枠)`,
        page,
        fullPage: true,
        checks: [{ label: "元の件数に戻る", ok: restored.length === before.length, detail: `${restored.length}/${before.length}` }],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-018 / 019(未実装の実測)
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-019",
      priority: "P1",
      phase: "B",
      order: 119,
      title: "【未実装】連続した申込・照会の回数制限(レート制限)",
      spec: "v2-20 / 非機能",
      refs: ["20_受け入れテスト/07_非機能・セキュリティ.md"],
      intent:
        "予約番号の総当たりや、いたずら予約の連投を止める仕組み。実装されていれば一定回数で拒否される。",
      notes: "機能が未実装であることを実測で示している(環境の制約ではない)。",
    },
    async (c) => {
      c.na(
        "レート制限は未実装です。実装されるまで「何回で拒否されるか」を確認する対象がありません。以下は現状の実測です。",
      );
      const { ctx, page } = await anonContext();
      const statuses = [];
      for (let i = 0; i < 12; i++) {
        const res = await page.goto(`${BASE}/c/demo/lookup`, { waitUntil: "domcontentloaded" });
        statuses.push(res?.status());
      }
      const blocked = statuses.filter((s) => s === 429).length;
      await c.step({
        label: "照会ページへ短時間に連続アクセス",
        action: "予約照会ページへ 12 回連続でアクセスする",
        expect: "(実装されていれば)途中から 429 などで拒否される",
        actual: `応答=${[...new Set(statuses)].join(",")} / 429 の回数=${blocked}`,
        note: "すべて 200 が返る = 回数制限がかかっていない。総当たり攻撃を秒間数十回のペースで試せる状態。",
        page,
        shot: false,
        checks: [
          { label: "(参考)現状は拒否されない", ok: true, detail: `429=${blocked} 回` },
        ],
      });
      c.issue({
        severity: "medium",
        status: "open",
        summary: "ログイン・予約申込・予約照会・患者検索に回数制限(レート制限)がない",
        detail:
          "照会ページへ 12 回連続でアクセスしても、すべて正常応答でした。予約番号(B-YYMMDD-4桁)とメールアドレスの組み合わせを機械的に試行し続けることが可能です。ログインのパスワード試行、いたずら予約の連投も同様に止まりません。",
        impact:
          "予約内容の不正閲覧・いたずら予約による枠の占有・メール送信の誘発。公開予約を本格運用するなら実装が望ましい水準です。",
        workaround:
          "当面は Vercel/Cloudflare 側の WAF・ボット対策で緩和できます。恒久対応は Upstash 等での IP/対象単位の制限(申し送り #3)。",
      });
      await ctx.close();
    },
  ),
);

verdicts.push(
  await runCase(
    {
      id: "AT-PUB-018",
      priority: "P2",
      phase: "B",
      order: 118,
      title: "【未実装】メール確認前の仮押さえを 30 分で自動解放する",
      spec: "v2-20",
      refs: REF,
      intent:
        "メール確認方式(auto)を使う場合、確認されないまま枠が押さえられ続けないようにする仕組み。",
      notes: "auto モード自体に確認ステップが無いため(AT-PUB-010 参照)、この機能も存在しない。",
    },
    async (c) => {
      c.na(
        "メール確認のステップ自体が未実装のため(AT-PUB-010)、その確認待ちを解放する仕組みも存在しません。手動承認で運用する限り、承認待ちの予約は院内が明示的に確定またはキャンセルするまで残ります。",
      );
      const q = `select count(*) from bookings where ${C} and status = 'requested'`;
      c.dbCheck({
        label: "承認待ちのまま残っている予約の件数",
        query: q,
        expect: "手動承認では自動解放されない(院内が判断する)",
        actual: `${sqlOne(q)} 件`,
        ok: true,
      });
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
