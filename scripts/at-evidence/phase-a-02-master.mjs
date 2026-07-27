// フェーズ A ② マスタ準備 — 実行順 5〜8
// AT-CAT-010(部屋) / AT-CAT-001(メニュー) / AT-CAT-012(担当割当) / AT-CAT-019(施術枠)
// seed で充足済みだが、本番の初期設定で担当者が実際に通る操作なので画面証跡を残す。
// 実行: node scripts/at-evidence/phase-a-02-master.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  closeBrowser,
  jstDate,
  login,
  runCase,
  selectOption,
  submitDialog,
  sql,
  sqlOne,
  summarize,
  waitToast,
} from "./lib.mjs";

const ROOM_NAME = "検証用 処置室A";
const SVC_NAME = "検証用 メニューA";
const verdicts = [];
const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const esc = (s) => s.replace(/'/g, "''");

// 冪等性: 前回実行の残骸を消す(ローカル限定)
sql(`delete from staff_service_assignments where service_id in (select id from services where ${C} and name = '${esc(SVC_NAME)}')`);
sql(`delete from services where ${C} and name = '${esc(SVC_NAME)}'`);
sql(`delete from schedule_blocks where ${C} and room_id in (select id from rooms where ${C} and name = '${esc(ROOM_NAME)}')`);
sql(`delete from rooms where ${C} and name = '${esc(ROOM_NAME)}'`);

// ---------------------------------------------------------------- 実行順 5
verdicts.push(
  await runCase(
    {
      id: "AT-CAT-010",
      priority: "P1",
      phase: "A",
      order: 5,
      title: "部屋の作成(施術室の登録)",
      spec: "v2-06",
      refs: ["20_受け入れテスト/02_メニュー・リソース・枠.md"],
      intent:
        "予約は「部屋 × 時間」で重複を防いでいるため、部屋が登録されていないと予約が 1 件も作れない。本番の初期設定で最初に通る操作。",
    },
    async (c) => {
      const { ctx, page } = await login("owner@demo.local");
      const before = Number(sqlOne(`select count(*) from rooms where ${C}`));

      await page.goto(`${BASE}/demo/rooms`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      await c.step({
        label: "部屋・担当設定を開く",
        action: "owner で /demo/rooms を開く",
        expect: "既存の部屋一覧と「部屋を追加」ボタンが表示される",
        actual: `既存 ${before} 室 / 追加ボタン=${await page.getByRole("button", { name: "部屋を追加" }).count()}個`,
        page,
        checks: [
          {
            label: "「部屋を追加」ボタンがある",
            ok: (await page.getByRole("button", { name: "部屋を追加" }).count()) > 0,
            detail: "owner のみ操作可",
          },
        ],
      });

      await page.getByRole("button", { name: "部屋を追加" }).first().click();
      await page.waitForTimeout(400);
      await page.fill("#room-name", ROOM_NAME);
      await c.step({
        label: "部屋名を入力",
        action: `ダイアログで部屋名「${ROOM_NAME}」を入力`,
        expect: "ダイアログ「部屋を追加」が開き、入力が反映される",
        actual: `入力値=${await page.inputValue("#room-name")}`,
        page,
        checks: [
          { label: "入力が反映", ok: (await page.inputValue("#room-name")) === ROOM_NAME, detail: ROOM_NAME },
        ],
      });

      const btn1 = await submitDialog(page);
      await page.waitForTimeout(1400);
      const listed = await page.getByText(ROOM_NAME).count();
      await c.step({
        label: "一覧に追加された",
        action: `ダイアログの「${btn1}」を押す`,
        expect: "ダイアログが閉じ、一覧に新しい部屋が表示される",
        actual: `一覧の一致=${listed}件`,
        note: "画面の一覧表示と、次の DB 裏取りの両方で確認している。",
        page,
        checks: [{ label: "一覧に表示される", ok: listed > 0, detail: `count=${listed}` }],
      });

      const q = `select name, status from rooms where ${C} and name = '${esc(ROOM_NAME)}'`;
      const row = sql(q)[0] ?? [];
      const after = Number(sqlOne(`select count(*) from rooms where ${C}`));
      c.dbCheck({
        label: "rooms に status=active の行が 1 件増える",
        query: q,
        expect: `件数 ${before}→${before + 1} / status=active`,
        actual: `件数 ${before}→${after} / 行=${row.join(", ") || "なし"}`,
        ok: after === before + 1 && row[1] === "active",
      });

      const aq = `select action, actor_type from audit_logs where ${C} and action = 'room.create' order by created_at desc limit 1`;
      const arow = sql(aq)[0] ?? [];
      c.dbCheck({
        label: "監査ログに room.create が記録される",
        query: aq,
        expect: "action=room.create / actor_type=member",
        actual: arow.join(", ") || "記録なし",
        ok: arow[0] === "room.create" && arow[1] === "member",
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 6
verdicts.push(
  await runCase(
    {
      id: "AT-CAT-001",
      priority: "P1",
      phase: "A",
      order: 6,
      title: "メニュー(施術メニュー)の作成",
      spec: "v2-05",
      refs: ["20_受け入れテスト/02_メニュー・リソース・枠.md"],
      intent:
        "メニューには所要時間の内訳(セッション構成)が入っており、予約枠の長さと空き枠の計算がここに依存する。",
    },
    async (c) => {
      const { ctx, page } = await login("owner@demo.local");
      const before = Number(sqlOne(`select count(*) from services where ${C}`));

      await page.goto(`${BASE}/demo/services`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      await c.step({
        label: "メニュー一覧を開く",
        action: "owner で /demo/services を開く",
        expect: "既存メニューと「メニューを追加」ボタンが表示される",
        actual: `既存 ${before} 件`,
        page,
        checks: [
          {
            label: "「メニューを追加」ボタンがある",
            ok: (await page.getByRole("button", { name: "メニューを追加" }).count()) > 0,
          },
        ],
      });

      await page.getByRole("button", { name: "メニューを追加" }).first().click();
      await page.waitForTimeout(500);
      await page.fill("#svc-name", SVC_NAME);
      await page.fill("#svc-price", "12000");
      const descLoc = page.locator("#svc-desc");
      if ((await descLoc.count()) > 0) await descLoc.fill("受け入れテスト用の検証メニュー。リスク・副作用の記載欄。");
      // 公開ページに載せる = 患者が予約できる状態にする
      await page.locator("#svc-showPrice").click();
      await page.locator("#svc-isPublic").click();
      await c.step({
        label: "メニュー情報を入力",
        action: `メニュー名「${SVC_NAME}」/ 料金 12000 円 / 説明を入力し、「料金を表示」「公開ページに掲載」をオン。カテゴリと問診テンプレは既定値(未分類・なし)のまま`,
        expect: "ダイアログ「メニューを追加」に入力が反映される",
        actual: `名前=${await page.inputValue("#svc-name")} / 料金=${await page.inputValue("#svc-price")} / カテゴリ=未分類(既定)`,
        note: "カテゴリを敢えて既定値のままにしている。ここで保存できないと、カテゴリを作っていないクリニックは 1 件もメニューを登録できないため。",
        page,
        fullPage: true,
        checks: [
          { label: "名前が入力される", ok: (await page.inputValue("#svc-name")) === SVC_NAME },
          { label: "料金が入力される", ok: (await page.inputValue("#svc-price")) === "12000" },
        ],
      });

      const btn2 = await submitDialog(page);
      await page.waitForTimeout(1600);
      const listed = await page.getByText(SVC_NAME).count();
      const formErr = await page.getByText(/Invalid|エラー|失敗|してください/).allTextContents();
      await c.step({
        label: "一覧に追加された",
        action: `ダイアログの「${btn2}」を押す`,
        expect: "エラーなく保存され、一覧に新しいメニューが表示される",
        actual: `一覧の一致=${listed}件 / フォームのエラー表示=${JSON.stringify(formErr)}`,
        note: "「カテゴリ未分類のまま保存できる」ことを含めて検証している(下記の修正済み問題を参照)。",
        page,
        fullPage: true,
        checks: [
          { label: "一覧に表示される", ok: listed > 0, detail: `count=${listed}` },
          { label: "フォームにエラーが出ない", ok: formErr.length === 0, detail: formErr.join(" / ") || "なし" },
        ],
      });

      const q = `select name, price_yen, status, jsonb_array_length(session_template) as sessions, is_public, coalesce(category_id::text,'NULL') from services where ${C} and name = '${esc(SVC_NAME)}'`;
      const row = sql(q)[0] ?? [];
      c.dbCheck({
        label: "services に行が作られ、セッション構成(所要時間の内訳)と公開フラグが保存される",
        query: q,
        expect: "price_yen=12000 / status=active / session_template が 1 件以上 / is_public=t / category_id=NULL(未分類)",
        actual: row.join(", ") || "なし",
        ok:
          row[1] === "12000" &&
          row[2] === "active" &&
          Number(row[3] ?? 0) >= 1 &&
          row[4] === "t" &&
          row[5] === "NULL",
      });

      // 回帰確認: 問診テンプレが未設定(NULL)の既存メニューを開いて保存できるか
      const legacy = sqlOne(
        `select name from services where ${C} and questionnaire_template_id is null and name <> '${esc(SVC_NAME)}' limit 1`,
      );
      if (legacy) {
        await page.goto(`${BASE}/demo/services`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(700);
        const card = page.locator("li,div").filter({ hasText: legacy }).first();
        const editBtn = card.getByRole("button", { name: /編集/ }).first();
        if ((await editBtn.count()) > 0) {
          await editBtn.click();
          await page.waitForTimeout(600);
          const btnE = await submitDialog(page, ["保存", "追加"]);
          await page.waitForTimeout(1400);
          const err = await page.getByText(/Invalid|エラー|失敗/).allTextContents();
          const stillOpen = await page.getByRole("dialog").count();
          await c.step({
            label: "既存メニューを開いて保存(回帰確認)",
            action: `問診テンプレが未設定のメニュー「${legacy}」を編集で開き、何も変えずに「${btnE}」を押す`,
            expect: "エラーなく保存され、ダイアログが閉じる",
            actual: `エラー=${JSON.stringify(err)} / ダイアログ残存=${stillOpen}`,
            note: "「なし」が既定値のまま保存できるかの確認。ここが落ちると既存メニューを一切編集できない。",
            page,
            fullPage: true,
            checks: [{ label: "エラーなく保存できる", ok: err.length === 0, detail: err.join(" / ") || "なし" }],
          });
        }
      }

      c.issue({
        severity: "high",
        status: "fixed",
        summary: "カテゴリ「未分類」/ 問診テンプレ「なし」のままメニューを保存すると Invalid UUID で失敗していた",
        detail:
          "画面の選択肢「未分類」「なし」は内部的に value=\"none\" を送るのに対し、サーバー側の検証が UUID か空文字しか許していなかったため、既定値のまま保存すると『Invalid UUID』という開発者向けの文言だけが出て保存できませんでした。カテゴリを 1 つも作っていないクリニックは新規メニューを 1 件も登録できず、問診テンプレが未設定の既存メニュー(seed では「カウンセリングのみ」「メディカルピーリング」)は開いて保存するだけで失敗していました。",
        impact:
          "本番の初期設定でメニュー登録が止まる = 予約が 1 件も作れない。エラー文言からは原因が分からず、担当者は自力で回復できません。",
        fix: "src/features/services/actions.ts に optionalUuid() を追加し、\"none\" と空文字を undefined へ正規化(検証前)。既存の意図はコード内コメントに書かれていたが実装が伴っていませんでした。",
        evidence: "ISS-01_修正前_メニュー保存がInvalidUUIDで失敗.png",
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 7
verdicts.push(
  await runCase(
    {
      id: "AT-CAT-012",
      priority: "P1",
      phase: "A",
      order: 7,
      title: "担当マトリクス(誰がどのメニューを担当できるか)の割当",
      spec: "v2-07",
      refs: ["20_受け入れテスト/02_メニュー・リソース・枠.md"],
      intent:
        "担当割当が無いスタッフは公開予約の空き枠に一切現れない。ここを設定し忘れると「予約できる枠が 1 件も出ない」という問い合わせになる。",
    },
    async (c) => {
      const { ctx, page } = await login("owner@demo.local");
      const svcId = sqlOne(`select id from services where ${C} and name = '${esc(SVC_NAME)}'`);
      if (!svcId) throw new Error(`前提のメニューがない: ${SVC_NAME}`);
      const before = Number(sqlOne(`select count(*) from staff_service_assignments where service_id = '${svcId}'`));

      await page.goto(`${BASE}/demo/rooms`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      // 指名可能なスタッフ(is_bookable)のみ行に出る
      const bookable = sql(
        `select coalesce(nullif(m.display_name,''), p.full_name) from clinic_members m left join profiles p on p.id = m.user_id where m.${C} and m.status='active' and m.is_bookable = true order by m.created_at`,
      ).map((r) => r[0]);
      // aria-label(「〇〇が△△を担当」)で対象列を特定する
      const box = page.locator(`[role="checkbox"][aria-label*="${SVC_NAME}を担当"]`);
      const found = await box.count();
      const targetStaff = found > 0 ? ((await box.first().getAttribute("aria-label")) ?? "").split("が")[0] : "(不明)";
      await c.step({
        label: "担当設定の表を開く",
        action: "owner で /demo/rooms の「担当設定」を確認",
        expect: `指名可能なスタッフ(${bookable.join("・")})× メニューの表が表示され、新しいメニューの列がある`,
        actual: `対象チェックボックス=${found}個(${targetStaff} × ${SVC_NAME})`,
        note: "aria-label(「〇〇が△△を担当」)で要素を特定しているため、表のレイアウト変更に影響されない。",
        page,
        fullPage: true,
        checks: [{ label: "対象のチェックボックスが存在する", ok: found > 0, detail: `count=${found}` }],
      });

      await box.first().click();
      await page.waitForTimeout(1200);
      const after = Number(sqlOne(`select count(*) from staff_service_assignments where service_id = '${svcId}'`));
      await c.step({
        label: "担当をオンにする",
        action: `「${targetStaff}が${SVC_NAME}を担当」のチェックを入れる`,
        expect: "即時に保存され、担当が 1 件増える",
        actual: `割当 ${before}→${after} 件`,
        page,
        fullPage: true,
        checks: [{ label: "割当が 1 件増える", ok: after === before + 1, detail: `${before}→${after}` }],
      });

      const q = `select m.is_bookable, s.name from staff_service_assignments a join clinic_members m on m.id = a.member_id join services s on s.id = a.service_id where a.service_id = '${svcId}'`;
      const rows = sql(q);
      c.dbCheck({
        label: "staff_service_assignments に反映され、対象は指名可能スタッフに限られる",
        query: q,
        expect: "1 行 / is_bookable=t",
        actual: rows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: rows.length === 1 && rows[0][0] === "t",
      });

      // 既知不具合: 担当設定の監査ログが記録されない(AT-CAT-014)
      const aq = `select count(*) from audit_logs where ${C} and action like 'assignment%'`;
      const auditCount = Number(sqlOne(aq));
      c.dbCheck({
        label: "【既知の弱点】担当設定の変更が監査ログに残るか",
        query: aq,
        expect: "本来は assignment.* が記録されるべき(AT-CAT-014)",
        actual: `assignment 系の監査ログ ${auditCount} 件`,
        ok: true, // 機能自体の合否ではないため判定には含めない。事実として記録する
      });
      if (auditCount === 0) {
        c.partial(
          "担当割当そのものは正しく保存されますが、この変更は監査ログに残りません(AT-CAT-014 の既知不具合)。誰がいつ担当を付け外ししたかを後から追跡できないため、運用でカバーするか改修が必要です。",
        );
        c.issue({
          severity: "low",
          summary: "担当設定の変更が監査ログに記録されない(AT-CAT-014)",
          detail: `割当の追加後も action like 'assignment%' の監査ログは ${auditCount} 件でした。他の操作(部屋作成・ログイン等)は記録されています。`,
          impact:
            "「担当が外れていて予約が取れない」等の問い合わせ時に、いつ誰が変更したのか追跡できません。患者影響はありませんが運用調査が難しくなります。",
          workaround: "変更時に運用側で記録を残す。改修は recordAudit() の呼び出し追加のみで済む軽微なもの。",
        });
      }
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 8
verdicts.push(
  await runCase(
    {
      id: "AT-CAT-019",
      priority: "P0",
      phase: "A",
      order: 8,
      title: "施術枠(受付枠)の確保 → 公開予約の空き枠に反映",
      spec: "v2-08",
      refs: ["20_受け入れテスト/02_メニュー・リソース・枠.md"],
      intent:
        "受付枠は「患者がインターネットから予約できる時間帯」そのもの。ここが作れないと公開予約が成立しないため P0。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const roomId = sqlOne(`select id from rooms where ${C} and name = '${esc(ROOM_NAME)}'`);
      const date = jstDate(3); // 3 日後(既存 seed の枠と衝突しない日)
      const before = Number(
        sqlOne(`select count(*) from schedule_blocks where ${C} and room_id = '${roomId}'`),
      );

      await page.goto(`${BASE}/demo/schedule`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      await c.step({
        label: "施術枠(週ビュー)を開く",
        action: "nurse1(看護師)で /demo/schedule を開く",
        expect: "週ビューと「施術枠を追加」ボタンが表示される(staff も操作可)",
        actual: `追加ボタン=${await page.getByRole("button", { name: "施術枠を追加" }).count()}個`,
        page,
        fullPage: true,
        checks: [
          {
            label: "「施術枠を追加」ボタンがある",
            ok: (await page.getByRole("button", { name: "施術枠を追加" }).count()) > 0,
          },
        ],
      });

      await page.getByRole("button", { name: "施術枠を追加" }).first().click();
      await page.waitForTimeout(500);
      await selectOption(page, "sb-member", "鈴木");
      await selectOption(page, "sb-room", ROOM_NAME);
      await selectOption(page, "sb-type", "受付枠");
      await page.fill("#sb-date", date);
      await page.fill("#sb-start", "13:00");
      await page.fill("#sb-end", "17:00");
      await c.step({
        label: "枠の条件を入力",
        action: `担当=鈴木 / 部屋=${ROOM_NAME} / 種別=受付枠 / ${date} 13:00〜17:00`,
        expect: "ダイアログに入力が反映される",
        actual: `日付=${await page.inputValue("#sb-date")} 開始=${await page.inputValue("#sb-start")} 終了=${await page.inputValue("#sb-end")}`,
        page,
        checks: [
          { label: "日付が入力される", ok: (await page.inputValue("#sb-date")) === date, detail: date },
          { label: "開始 13:00", ok: (await page.inputValue("#sb-start")) === "13:00" },
          { label: "終了 17:00", ok: (await page.inputValue("#sb-end")) === "17:00" },
        ],
      });

      const btn3 = await submitDialog(page);
      const toast = await waitToast(page, /追加しました|作成しました|保存しました/);
      await page.waitForTimeout(1000);
      const after = Number(
        sqlOne(`select count(*) from schedule_blocks where ${C} and room_id = '${roomId}'`),
      );
      await c.step({
        label: "枠が週ビューに現れる",
        action: `ダイアログの「${btn3}」を押す`,
        expect: "枠が 1 件増え、週ビューに表示される",
        actual: `toast=${toast} / 枠 ${before}→${after} 件`,
        page,
        fullPage: true,
        checks: [{ label: "枠が 1 件増える", ok: after === before + 1, detail: `${before}→${after}` }],
      });

      const q = `select block_type,
                        to_char(lower(time_range) at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI') as start_jst,
                        to_char(upper(time_range) at time zone 'Asia/Tokyo','YYYY-MM-DD HH24:MI') as end_jst
                 from schedule_blocks where ${C} and room_id = '${roomId}' order by lower(time_range) desc limit 1`;
      const row = sql(q)[0] ?? [];
      c.dbCheck({
        label: "schedule_blocks に受付枠として保存され、JST の時刻がずれない",
        query: q.replace(/\s+/g, " "),
        expect: `block_type=open / ${date} 13:00 〜 ${date} 17:00 (JST)`,
        actual: row.join(" / ") || "なし",
        ok: row[0] === "open" && row[1] === `${date} 13:00` && row[2] === `${date} 17:00`,
      });

      // 公開予約の空き枠に反映されるか(担当割当が必要 = 実行順 7 の効果を確認)
      const pubPage = await ctx.newPage();
      await pubPage.goto(`${BASE}/c/demo/reserve`, { waitUntil: "domcontentloaded" });
      await pubPage.waitForTimeout(900);
      const menuVisible = await pubPage.getByText(SVC_NAME).count();
      await c.step({
        label: "公開予約ページに新メニューが出る",
        action: "患者が見る /c/demo/reserve を開く",
        expect: `作成したメニュー「${SVC_NAME}」が選択肢に出る(公開かつ担当割当済みのため)`,
        actual: `メニューの一致=${menuVisible}件`,
        note: "受付枠は「メニュー × 担当 × 部屋 × 時間」が全て揃って初めて空き枠になる。ここは公開側の入口が開いたことの確認。",
        page: pubPage,
        fullPage: true,
        checks: [{ label: "新メニューが公開ページに出る", ok: menuVisible > 0, detail: `count=${menuVisible}` }],
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
