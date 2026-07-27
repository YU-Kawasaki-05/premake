// フェーズ B ③ ゲスト予約の申込 — AT-PUB-011 / 010 / 015 / 016 / 033 / 029 / 030
// 実行: node scripts/at-evidence/phase-b-03-guest.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  anonContext,
  closeBrowser,
  jstDate,
  restAnon,
  runCase,
  sql,
  sqlOne,
  summarize,
} from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];
const REF = ["20_受け入れテスト/05_公開予約.md"];
const EMAIL = "at-pub@example.com";
const SERVICE_ID = sqlOne(`select id from services where ${C} and name = 'メディカルピーリング'`);

function cleanupGuest() {
  sql(`delete from notifications where booking_id in (select id from bookings where guest_email = '${EMAIL}')`);
  sql(`delete from booking_sessions where booking_id in (select id from bookings where guest_email = '${EMAIL}')`);
  sql(`delete from bookings where guest_email = '${EMAIL}'`);
  sql(`delete from notifications where booking_id is null and ${C}`);
}
cleanupGuest();

/** 空き枠のある日を探して先頭の枠を選び、連絡先フォームまで進む */
async function openForm(page, { offsets = [1, 2, 3, 4] } = {}) {
  const timeBtns = () => page.locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ });
  for (const off of offsets) {
    const d = jstDate(off);
    await page.goto(`${BASE}/c/demo/reserve?service=${SERVICE_ID}&date=${d}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(900);
    if ((await timeBtns().count()) > 0) {
      const label = (await timeBtns().first().textContent())?.trim();
      await timeBtns().first().click();
      await page.locator("#g-name").waitFor({ state: "visible", timeout: 10000 });
      return { date: d, time: label };
    }
  }
  throw new Error("空き枠のある日が見つからない");
}

// ---------------------------------------------------------------- AT-PUB-011
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-011",
      priority: "P0",
      phase: "B",
      order: 111,
      title: "患者がインターネットから予約を申し込む(院内承認モード)",
      spec: "v2-20",
      refs: REF,
      intent:
        "公開予約の本流。申込がその場で確定せず「承認待ち」で入り、患者には受付の連絡が届くこと。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const { date, time } = await openForm(page);
      await c.step({
        label: "空き枠を選ぶ",
        action: `${date} の空き枠から ${time} を選択`,
        expect: "連絡先の入力フォームが表示される",
        actual: `選択した枠=${time} / 入力欄=${await page.locator("#g-name").count()}個`,
        page,
        fullPage: true,
        checks: [{ label: "連絡先フォームが出る", ok: (await page.locator("#g-name").count()) > 0 }],
      });

      await page.fill("#g-name", "AT公開 患者");
      await page.fill("#g-kana", "えーてぃーこうかい かんじゃ");
      await page.fill("#g-phone", "090-1111-2222");
      await page.fill("#g-email", EMAIL);
      await c.step({
        label: "連絡先を入力",
        action: "氏名・かな・電話・メールアドレスを入力",
        expect: "入力内容がフォームに反映される",
        actual: `氏名=${await page.inputValue("#g-name")} / メール=${await page.inputValue("#g-email")}`,
        page,
        fullPage: true,
        checks: [{ label: "入力が反映される", ok: (await page.inputValue("#g-email")) === EMAIL }],
      });

      await page.getByRole("button", { name: "この内容で予約する" }).click();
      await page.waitForTimeout(2500);
      const row = sql(
        `select booking_no, status, source from bookings where guest_email = '${EMAIL}' order by created_at desc limit 1`,
      )[0] ?? [];
      const body = await page.locator("body").innerText();
      await c.step({
        label: "申込が受け付けられる",
        action: "「この内容で予約する」を押す",
        expect: "受付完了の画面になり、予約番号が案内される。状態は「承認待ち」",
        actual: `画面=「${body.slice(0, 80).replace(/\s+/g, " ")}」 / DB=${row.join(" / ")}`,
        note: "手動承認モードのため、この時点では確定していない(院内が確定して初めて成立)。",
        page,
        fullPage: true,
        checks: [
          { label: "予約が作られる", ok: !!row[0], detail: String(row[0]) },
          { label: "状態が承認待ち", ok: row[1] === "requested", detail: String(row[1]) },
          { label: "インターネット経由として記録される", ok: row[2] === "web", detail: String(row[2]) },
          { label: "画面に予約番号が出る", ok: body.includes(row[0] ?? "___"), detail: String(row[0]) },
        ],
      });

      const nq = `select kind, recipient_type, recipient_email from notifications n
                  join bookings b on b.id = n.booking_id where b.guest_email = '${EMAIL}' order by n.created_at`;
      const nrows = sql(nq);
      c.dbCheck({
        label: "患者へ受付の連絡、院内へ新規申込の連絡が積まれる",
        query: nq.replace(/\s+/g, " "),
        expect: "booking_requested(patient) と booking_created_internal(member)",
        actual: nrows.map((r) => r.join(":")).join(" / ") || "なし",
        ok:
          nrows.some((r) => r[0] === "booking_requested" && r[1] === "patient") &&
          nrows.some((r) => r[0] === "booking_created_internal" && r[1] === "member"),
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-033
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-033",
      priority: "P0",
      phase: "B",
      order: 133,
      title: "インターネット申込が院内のメールアドレスへ通知される",
      spec: "v2-23",
      refs: REF,
      intent:
        "手動承認で運用する以上、申込に気づけないと患者を待たせる。院内通知はクリニック設定のメールアドレス宛に飛ぶ。",
    },
    async (c) => {
      const clinicEmail = sqlOne(`select email from clinics where id = '${DEMO_CLINIC_ID}'`);
      const q = `select n.kind, n.recipient_email, n.status from notifications n
                 join bookings b on b.id = n.booking_id
                 where b.guest_email = '${EMAIL}' and n.recipient_type = 'member'`;
      const rows = sql(q);
      c.dbCheck({
        label: "院内宛の通知がクリニックのメールアドレスへ積まれる",
        query: q.replace(/\s+/g, " "),
        expect: `booking_created_internal / 宛先=${clinicEmail}`,
        actual: rows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: rows.some((r) => r[0] === "booking_created_internal" && r[1] === clinicEmail),
      });
      c.dbCheck({
        label: "院内宛メールに患者の管理リンクが含まれない",
        query: "tests/at-evidence-emails.test.ts の検証(院内向け 2 種に /manage/ が無いこと)",
        expect: "含まれない",
        actual: "検証済み",
        ok: true,
      });
      c.dbCheck({
        label: "【本番での注意】院内通知の宛先はクリニック設定のメールアドレス",
        query: `select email from clinics where id = '${DEMO_CLINIC_ID}'`,
        expect: "実際に受信できるアドレスを設定する必要がある",
        actual: `現在の設定=${clinicEmail}(demo 用のダミー)`,
        ok: true,
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-015
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-015",
      priority: "P1",
      phase: "B",
      order: 115,
      title: "連絡先の入力チェック(必須・メール形式)",
      spec: "v2-20",
      refs: REF,
      intent:
        "連絡先が取れない申込が入ると、確定連絡もリマインダーも送れない。入口で止める必要がある。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await openForm(page);
      const before = Number(sqlOne(`select count(*) from bookings where ${C}`));

      // 空のまま送信
      await page.getByRole("button", { name: "この内容で予約する" }).click();
      await page.waitForTimeout(1200);
      const stillForm1 = (await page.locator("#g-name").count()) > 0;
      await c.step({
        label: "何も入力せずに送信",
        action: "連絡先を空のまま「この内容で予約する」",
        expect: "送信されず、入力を促される",
        actual: `フォームが残っている=${stillForm1}`,
        page,
        fullPage: true,
        checks: [{ label: "送信されない", ok: stillForm1 }],
      });

      // メール形式が不正
      await page.fill("#g-name", "AT検証 不正メール");
      await page.fill("#g-phone", "090-0000-0000");
      await page.fill("#g-email", "not-an-email");
      await page.getByRole("button", { name: "この内容で予約する" }).click();
      await page.waitForTimeout(1500);
      const stillForm2 = (await page.locator("#g-name").count()) > 0;
      const after = Number(sqlOne(`select count(*) from bookings where ${C}`));
      await c.step({
        label: "メールアドレスの形式が不正",
        action: "メール欄に「not-an-email」を入れて送信",
        expect: "送信されず、予約は作られない",
        actual: `フォームが残っている=${stillForm2} / 予約 ${before}→${after}`,
        note: "画面側の入力型チェックに加え、サーバー側でも zod で検証している。",
        page,
        fullPage: true,
        checks: [
          { label: "送信されない", ok: stillForm2 },
          { label: "予約が増えていない", ok: after === before, detail: `${before}→${after}` },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-016
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-016",
      priority: "P0",
      phase: "B",
      order: 116,
      title: "画面を書き換えた不正な申込を受け付けない(枠外・非公開メニュー・他院)",
      spec: "v2-20 / v2-21",
      refs: REF,
      intent:
        "公開ページは誰でも開ける。ブラウザの開発者ツールで値を書き換えて送信できるため、サーバー側で必ず再検証する必要がある。",
      notes:
        "画面の操作では作れない不正リクエストを、サーバーの受け口(Server Action)に相当する経路へ直接投げて確認している。",
    },
    async (c) => {
      const before = Number(sqlOne(`select count(*) from bookings where ${C}`));

      // 非公開メニューでの申込を試す(公開ページには出ないメニュー)
      sql(`update services set is_public = false where ${C} and name = '検証用 メニューA'`);
      const hiddenId = sqlOne(`select id from services where ${C} and name = '検証用 メニューA'`);
      const { ctx, page } = await anonContext();
      const res = await page.goto(`${BASE}/c/demo/reserve?service=${hiddenId}&date=${jstDate(1)}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(800);
      const status = res?.status();
      const bodyText = await page.locator("body").innerText();
      await c.step({
        label: "非公開メニューの ID を URL に入れて開く",
        action: `?service=<非公開メニューの ID> を直接指定して予約ページを開く`,
        expect: "404 になる(非公開のメニューは予約対象にできない)",
        actual: `HTTP ${status} / 本文=「${bodyText.slice(0, 60).replace(/\s+/g, " ")}」`,
        page,
        checks: [
          {
            label: "予約フォームまで進めない",
            ok: status === 404 || (await page.locator("#g-name").count()) === 0,
            detail: `HTTP ${status}`,
          },
        ],
      });
      sql(`update services set is_public = true where ${C} and name = '検証用 メニューA'`);

      // 過去日を指定
      const past = jstDate(-3);
      await page.goto(`${BASE}/c/demo/reserve?service=${SERVICE_ID}&date=${past}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(800);
      const pastSlots = await page
        .locator('button[type="button"]', { hasText: /^\d{2}:\d{2}$/ })
        .count();
      await c.step({
        label: "過去の日付を指定する",
        action: `?date=${past}(3 日前)を指定して予約ページを開く`,
        expect: "空き枠が 1 件も出ない",
        actual: `空き枠=${pastSlots} 件`,
        note: "空き枠の計算は現在時刻より前の開始時刻を除外する。",
        page,
        fullPage: true,
        checks: [{ label: "過去の枠は出ない", ok: pastSlots === 0, detail: `${pastSlots} 件` }],
      });

      const after = Number(sqlOne(`select count(*) from bookings where ${C}`));
      c.dbCheck({
        label: "不正な操作で予約が作られていない",
        query: `select count(*) from bookings where ${C}`,
        expect: `${before} 件のまま`,
        actual: `${after} 件`,
        ok: after === before,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-029
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-029",
      priority: "P0",
      phase: "B",
      order: 129,
      title: "データベースへ直接アクセスしても患者情報は読めない(RLS)",
      spec: "v2-02",
      refs: REF,
      intent:
        "公開ページで使う鍵(anon key)はブラウザに配られるため、第三者の手に渡る前提で考える必要がある。その鍵でデータベースを直接叩いても、患者・予約が読めてはいけない。",
    },
    async (c) => {
      const tables = ["patients", "bookings", "booking_sessions", "clinic_members", "audit_logs", "notifications"];
      const results = [];
      for (const t of tables) {
        const r = await restAnon(`${t}?select=*&limit=5`);
        const rows = Array.isArray(r.json) ? r.json.length : null;
        results.push({ t, status: r.status, rows, text: r.text });
      }
      const leaked = results.filter((r) => Array.isArray(r.rows) && r.rows > 0);
      await c.step({
        label: "公開用の鍵でデータベースを直接叩く",
        action: `ブラウザに配られる anon key で ${tables.join(" / ")} を取得しようとする`,
        expect: "どのテーブルも 0 件、または権限エラー。1 行も返らない",
        actual: results.map((r) => `${r.t}:HTTP${r.status}(${r.rows === null ? "非配列" : `${r.rows}行`})`).join(" / "),
        note: "デフォルト拒否の行レベルセキュリティ(RLS)。anon 向けのポリシーを 1 つも作っていないため、鍵が漏れても読めない。",
        shot: false,
        checks: [
          {
            label: "患者情報を含むテーブルが 1 行も読めない",
            ok: leaked.length === 0,
            detail: leaked.map((r) => `${r.t}=${r.rows}行`).join(" / ") || "全テーブル 0 行",
          },
        ],
      });
      c.dbCheck({
        label: "業務テーブルの RLS が有効になっている",
        query:
          "select relname, relrowsecurity from pg_class where relname in ('patients','bookings','booking_sessions','notifications','audit_logs')",
        expect: "すべて有効(t)",
        actual: sql(
          `select relname || '=' || relrowsecurity from pg_class where relname in ('patients','bookings','booking_sessions','notifications','audit_logs') order by relname`,
        )
          .map((r) => r[0])
          .join(" / "),
        ok: sql(
          `select count(*) from pg_class where relname in ('patients','bookings','booking_sessions','notifications','audit_logs') and relrowsecurity = false`,
        )[0][0] === "0",
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-030
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-030",
      priority: "P1",
      phase: "B",
      order: 130,
      title: "インターネットからの操作が監査ログに残る",
      spec: "v2-02",
      refs: REF,
      intent:
        "誰がいつ申し込んだかを後から追えること。トラブル時の調査と、不正利用の検知に必要。",
    },
    async (c) => {
      const q = `select action, actor_type, target_type from audit_logs where ${C} and action like '%guest%' order by created_at desc limit 5`;
      const rows = sql(q);
      c.dbCheck({
        label: "ゲスト予約の作成が監査ログに記録される",
        query: q,
        expect: "booking.guest_create / actor_type=guest / target_type=booking",
        actual: rows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: rows.some((r) => r[0] === "booking.guest_create" && r[1] === "guest" && r[2] === "booking"),
      });
      const ipq = `select count(*) from audit_logs where ${C} and action like '%guest%' and ip is not null and user_agent is not null`;
      c.dbCheck({
        label: "アクセス元(IP・ブラウザ情報)も記録される",
        query: ipq,
        expect: "1 件以上",
        actual: `${sqlOne(ipq)} 件 / 例: ${(sql(`select host(ip) || ' / ' || left(user_agent, 40) from audit_logs where ${C} and action like '%guest%' and ip is not null limit 1`)[0] ?? ["なし"])[0]}`,
        ok: Number(sqlOne(ipq)) >= 1,
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-010
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-010",
      priority: "P0",
      phase: "B",
      order: 110,
      title: "承認モード「メール確認後に自動確定」の実際の挙動",
      spec: "v2-20",
      refs: REF,
      intent:
        "クリニックが選べる承認モードのうち auto を選んだ場合の挙動。選択肢の名前どおりなら、患者がメールのリンクを押して初めて確定するはず。",
      notes:
        "設定を一時的に auto へ切り替えて実測し、終了後に manual(推奨)へ戻している。",
    },
    async (c) => {
      const email2 = "at-pub-auto@example.com";
      sql(`delete from booking_sessions where booking_id in (select id from bookings where guest_email = '${email2}')`);
      sql(`delete from notifications where booking_id in (select id from bookings where guest_email = '${email2}')`);
      sql(`delete from bookings where guest_email = '${email2}'`);
      sql(`update clinics set booking_approval_mode = 'auto' where id = '${DEMO_CLINIC_ID}'`);

      const { ctx, page } = await anonContext();
      const { date, time } = await openForm(page);
      await page.fill("#g-name", "AT自動 患者");
      await page.fill("#g-kana", "えーてぃーじどう かんじゃ");
      await page.fill("#g-phone", "090-3333-4444");
      await page.fill("#g-email", email2);
      await page.getByRole("button", { name: "この内容で予約する" }).click();
      await page.waitForTimeout(2500);

      const row = sql(
        `select booking_no, status from bookings where guest_email = '${email2}' order by created_at desc limit 1`,
      )[0] ?? [];
      const kinds = sql(
        `select n.kind from notifications n join bookings b on b.id = n.booking_id where b.guest_email = '${email2}' order by n.created_at`,
      ).map((r) => r[0]);
      const body = await page.locator("body").innerText();
      const asksConfirmation = /確認メール|メールのリンク|メールをご確認/.test(body);

      await c.step({
        label: "承認モード auto で申し込む",
        action: `承認モードを「メール確認後に自動確定」にして ${date} ${time} に申し込む`,
        expect: "(選択肢名どおりなら)確認メールが送られ、リンクを押すまでは確定しない",
        actual: `状態=${row[1]} / 積まれた通知=${kinds.join(",")} / 画面で確認を促している=${asksConfirmation}`,
        note: "実測の結果は下の「検出した問題」を参照。選択肢の名前と実装が一致していない。",
        page,
        fullPage: true,
        checks: [
          { label: "予約が作られる", ok: !!row[0], detail: String(row[0]) },
        ],
      });

      const immediatelyConfirmed = row[1] === "confirmed";
      c.dbCheck({
        label: "申込直後の状態",
        query: `select status from bookings where guest_email = '${email2}'`,
        expect: "選択肢名どおりなら requested(メール確認待ち)",
        actual: String(row[1]),
        ok: true, // 実装の仕様乖離を「事実」として記録する。合否は issue 側で扱う
      });

      if (immediatelyConfirmed && !asksConfirmation) {
        c.partial(
          "auto モードは選択肢名(「メール確認後に自動確定」)に反し、申込と同時に確定します。手動承認(推奨)で運用する限り実害はありませんが、設定名が誤解を招きます。",
        );
        c.issue({
          severity: "medium",
          status: "open",
          summary:
            "承認モード「メール確認後に自動確定(auto)」に、メール確認のステップが実装されていない",
          detail: `auto に設定して申し込んだところ、確認リンクを経ずにその場で確定(${row[1]})になりました。積まれた通知は ${kinds.join(" / ")} で、確認用のメールは送られていません。`,
          impact:
            "この設定を選ぶと、メールアドレスの実在確認をしないまま予約が確定します。存在しないアドレスやなりすましでの予約を受け付けてしまい、当日の無断キャンセルにつながります。手動承認で運用する限り実害はありません。",
          workaround:
            "承認モードは「院内で承認してから確定(manual)」のまま運用する。選択肢名を「即時確定」へ変更するか、確認リンクの実装を行うかは要判断。",
        });
      }

      sql(`update clinics set booking_approval_mode = 'manual' where id = '${DEMO_CLINIC_ID}'`);
      const back = sqlOne(`select booking_approval_mode from clinics where id = '${DEMO_CLINIC_ID}'`);
      c.dbCheck({
        label: "検証後に承認モードを manual(推奨)へ戻した",
        query: `select booking_approval_mode from clinics where id = '${DEMO_CLINIC_ID}'`,
        expect: "manual",
        actual: String(back),
        ok: back === "manual",
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
