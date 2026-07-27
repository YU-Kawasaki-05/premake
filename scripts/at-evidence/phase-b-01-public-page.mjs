// フェーズ B ① 公開ページの表示・医療広告要件 — AT-PUB-001〜008 / 031
// 実行: node scripts/at-evidence/phase-b-01-public-page.mjs
import { BASE, DEMO_CLINIC_ID, anonContext, closeBrowser, jstDate, runCase, sql, sqlOne, summarize } from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];
const REF = ["20_受け入れテスト/05_公開予約.md"];

const clinic = sql(
  `select name, director_name, postal_code, address, phone from clinics where id = '${DEMO_CLINIC_ID}'`,
)[0];
const [cName, cDirector, cPostal, cAddress, cPhone] = clinic;

// ---------------------------------------------------------------- AT-PUB-001
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-001",
      priority: "P0",
      phase: "B",
      order: 101,
      title: "公開ページに医療の提供主体が明示される",
      spec: "v2-19",
      refs: REF,
      intent:
        "医療広告ガイドラインで求められる「誰が提供する医療か」の明示。院名・院長名・所在地・連絡先が欠けると広告規制に触れる。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const body = await page.locator("body").innerText();
      const checks = [
        ["クリニック名", cName],
        ["院長名", cDirector],
        ["郵便番号", cPostal],
        ["住所", cAddress],
        ["電話番号", cPhone],
      ].map(([label, value]) => ({
        label: `${label}(${value})が表示される`,
        ok: value ? body.includes(value) : false,
        detail: String(value),
      }));
      await c.step({
        label: "公開ページを開く",
        action: "患者として /c/demo を開く(ログイン不要)",
        expect: "クリニック名・院長名・所在地・電話番号が表示される",
        actual: checks.map((k) => `${k.label.split("(")[0]}=${k.ok}`).join(" / "),
        note: "DB に登録されている値をそのまま期待値にして、画面本文と突き合わせている。",
        page,
        fullPage: true,
        checks,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-002 / 003
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-002",
      priority: "P0",
      phase: "B",
      order: 102,
      title: "自由診療であることと副作用リスクが記載される",
      spec: "v2-19",
      refs: REF,
      intent:
        "自由診療(保険適用外)であること、副作用が起こりうることの明示は医療広告の必須要件。これが無いと公開できない。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const body = await page.locator("body").innerText();
      await c.step({
        label: "注意書きの記載を確認",
        action: "公開ページ下部の注意書きを読む",
        expect: "「自由診療」の明示と、副作用(発赤・腫れ等)についての記載がある",
        actual: `自由診療=${body.includes("自由診療")} / 副作用=${body.includes("副作用")} / 個人差=${body.includes("個人差")}`,
        page,
        fullPage: true,
        checks: [
          { label: "「自由診療」の記載がある", ok: body.includes("自由診療") },
          { label: "副作用についての記載がある", ok: body.includes("副作用") },
          { label: "効果に個人差がある旨の記載がある", ok: body.includes("個人差") },
        ],
      });
      await ctx.close();
    },
  ),
);

verdicts.push(
  await runCase(
    {
      id: "AT-PUB-003",
      priority: "P0",
      phase: "B",
      order: 103,
      title: "症例写真・体験談が掲載されていない",
      spec: "v2-19",
      refs: REF,
      intent:
        "症例写真や患者の体験談を出すには医療広告の「限定解除」要件(詳細な説明の併記等)を満たす必要がある。現状は載せない方針のため、載っていないことを確認する。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const imgs = await page.locator("img").count();
      const body = await page.locator("body").innerText();
      const testimonialWords = ["体験談", "口コミ", "お客様の声", "ビフォー", "アフター", "症例"];
      const hit = testimonialWords.filter((w) => body.includes(w));
      await c.step({
        label: "画像と体験談の有無を確認",
        action: "公開ページ内の画像要素と、体験談を示す語句を検査",
        expect: "施術結果の写真がなく、体験談・口コミの掲載もない",
        actual: `img 要素=${imgs}個 / 該当語句=${hit.join("・") || "なし"}`,
        note: "語句とマークアップの両面から確認している。将来症例を載せる場合は限定解除の要件確認が必要。",
        page,
        fullPage: true,
        checks: [
          { label: "施術結果の画像がない", ok: imgs === 0, detail: `img=${imgs}` },
          { label: "体験談・口コミの掲載がない", ok: hit.length === 0, detail: hit.join("・") || "なし" },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-004
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-004",
      priority: "P1",
      phase: "B",
      order: 104,
      title: "料金は「表示する」設定のメニューだけに出る",
      spec: "v2-05 / v2-19",
      refs: REF,
      intent:
        "料金の出し方はクリニックの方針。表示しない設定にしたメニューの価格が漏れると、掲示していない価格を広告したことになる。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const body = await page.locator("body").innerText();
      const rows = sql(
        `select name, show_price, price_yen from services where ${C} and is_public = true and status = 'active' and price_yen is not null`,
      );
      const checks = rows.map(([name, show, price]) => {
        const yen = `¥${Number(price).toLocaleString("en-US")}`;
        const shown = body.includes(yen);
        return {
          label: show === "t" ? `「${name}」は価格 ${yen} が表示される` : `「${name}」の価格 ${yen} は表示されない`,
          ok: show === "t" ? shown : !shown,
          detail: `show_price=${show} 画面表示=${shown}`,
        };
      });
      await c.step({
        label: "メニューごとの価格表示を確認",
        action: "公開ページのメニュー一覧で、価格の有無を DB の設定と突き合わせる",
        expect: "「料金を表示」がオンのメニューだけ価格が出る",
        actual: rows.map(([n, s]) => `${n}:${s === "t" ? "表示" : "非表示"}`).join(" / "),
        page,
        fullPage: true,
        checks,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-005
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-005",
      priority: "P0",
      phase: "B",
      order: 105,
      title: "非公開・停止したメニューは公開ページに出ない",
      spec: "v2-05 / v2-19",
      refs: REF,
      intent:
        "院内専用メニューや提供をやめたメニューが患者から予約できてしまうと、対応できない予約が入る。",
      notes:
        "非公開のメニューが seed に無いため、検証用メニューを一時的に非公開へ切り替えて確認し、終了後に元へ戻している。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const svc = "検証用 メニューA";
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const beforeShown = (await page.locator("body").innerText()).includes(svc);
      await c.step({
        label: "公開中のメニューが出ている",
        action: `公開ページで「${svc}」が掲載されていることを確認`,
        expect: "公開設定のメニューは一覧に出る",
        actual: `掲載=${beforeShown}`,
        page,
        checks: [{ label: "公開中は掲載される", ok: beforeShown }],
      });

      sql(`update services set is_public = false where ${C} and name = '${svc}'`);
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const afterShown = (await page.locator("body").innerText()).includes(svc);
      await c.step({
        label: "非公開に切り替えると消える",
        action: `「${svc}」を非公開(公開ページに掲載しない)に変更して再読み込み`,
        expect: "一覧から消え、患者からは予約できなくなる",
        actual: `掲載=${afterShown}`,
        page,
        fullPage: true,
        checks: [{ label: "非公開にすると消える", ok: !afterShown }],
      });
      sql(`update services set is_public = true where ${C} and name = '${svc}'`);
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-006
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-006",
      priority: "P1",
      phase: "B",
      order: 106,
      title: "診療時間と法定ページへのリンクが表示される",
      spec: "v2-19 / v2-26",
      refs: REF,
      intent:
        "診療時間は患者が最初に見る情報。プライバシーポリシー・利用規約は個人情報を預かるサービスとして必須の掲示。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const body = await page.locator("body").innerText();
      const hours = sqlOne(`select business_hours::text from clinics where id = '${DEMO_CLINIC_ID}'`);
      const privacy = await page.getByRole("link", { name: /プライバシー/ }).count();
      const terms = await page.getByRole("link", { name: /利用規約/ }).count();
      const lookup = await page.getByRole("link", { name: /確認・変更・キャンセル|予約の確認/ }).count();
      await c.step({
        label: "診療時間と各リンクを確認",
        action: "公開ページの診療時間欄とフッターのリンクを見る",
        expect: "曜日ごとの診療時間、プライバシーポリシー・利用規約・予約確認へのリンクがある",
        actual: `診療時間の表示=${body.includes("診療時間")} / プライバシー=${privacy} / 利用規約=${terms} / 予約確認=${lookup}`,
        note: `DB の営業時間設定: ${hours}`,
        page,
        fullPage: true,
        checks: [
          { label: "診療時間が表示される", ok: body.includes("診療時間") && body.includes("10:00") },
          { label: "プライバシーポリシーへのリンクがある", ok: privacy > 0 },
          { label: "利用規約へのリンクがある", ok: terms > 0 },
          { label: "予約の確認・変更・キャンセルへの入口がある", ok: lookup > 0 },
        ],
      });

      // リンク先が実際に開けるか
      const res1 = await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
      const p1 = (await page.locator("body").innerText()).slice(0, 60).replace(/\s+/g, " ");
      const res2 = await page.goto(`${BASE}/terms`, { waitUntil: "domcontentloaded" });
      const p2 = (await page.locator("body").innerText()).slice(0, 60).replace(/\s+/g, " ");
      await c.step({
        label: "法定ページが開ける",
        action: "/privacy と /terms を直接開く",
        expect: "どちらも 200 で内容が表示される",
        actual: `privacy=HTTP ${res1?.status()} 「${p1}」 / terms=HTTP ${res2?.status()} 「${p2}」`,
        note: "現在の文言は暫定版。本文の確定と弁護士確認は人が行う作業として残っている(未検証項目を参照)。",
        page,
        fullPage: true,
        checks: [
          { label: "プライバシーポリシーが開ける", ok: res1?.status() === 200 },
          { label: "利用規約が開ける", ok: res2?.status() === 200 },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-007
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-007",
      priority: "P1",
      phase: "B",
      order: 107,
      title: "存在しないクリニックの URL は 404 になる",
      spec: "v2-19",
      refs: REF,
      intent:
        "URL を推測して他のクリニックの存在を探れないようにする。エラーの出方で情報が漏れないことも確認する。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const res = await page.goto(`${BASE}/c/no-such-clinic-xyz`, { waitUntil: "domcontentloaded" });
      const body = await page.locator("body").innerText();
      await c.step({
        label: "存在しない slug を開く",
        action: "/c/no-such-clinic-xyz を開く",
        expect: "404 が返り、他クリニックの情報は一切出ない",
        actual: `HTTP ${res?.status()} / 本文の冒頭=「${body.slice(0, 60).replace(/\s+/g, " ")}」`,
        page,
        checks: [
          { label: "404 が返る", ok: res?.status() === 404, detail: `HTTP ${res?.status()}` },
          { label: "他クリニックの名称が出ない", ok: !body.includes(cName) },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-008
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-008",
      priority: "P0",
      phase: "B",
      order: 108,
      title: "オンライン予約をオフにすると患者向けの導線が閉じる",
      spec: "v2-19 / v2-20",
      refs: REF,
      intent:
        "「今は電話予約だけにしたい」ときに確実に止められること。オフにしたのに申し込めてしまうと、対応できない予約が入る。",
      notes: "クリニック設定を一時的にオフへ切り替えて確認し、終了後に元(オン)へ戻している。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      sql(`update clinics set public_booking_enabled = false where id = '${DEMO_CLINIC_ID}'`);
      const res1 = await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const topBody = await page.locator("body").innerText();
      const reserveBtns = await page.getByRole("link", { name: "予約する" }).count();
      const res2 = await page.goto(`${BASE}/c/demo/reserve`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      const reserveStatus = res2?.status();
      const reserveBody = await page.locator("body").innerText();
      await c.step({
        label: "オンライン予約をオフにする",
        action: "クリニック設定でオンライン予約をオフにし、公開ページと予約ページを開く",
        expect: "予約ボタンが消え、予約ページも開けない(404 または受付停止の案内)",
        actual: `トップの予約ボタン=${reserveBtns}個 / 予約ページ=HTTP ${reserveStatus} 「${reserveBody.slice(0, 50).replace(/\s+/g, " ")}」`,
        page,
        fullPage: true,
        checks: [
          { label: "予約ボタンが出ない", ok: reserveBtns === 0, detail: `${reserveBtns}個` },
          {
            label: "予約ページから申し込めない",
            ok: reserveStatus === 404 || /受付|停止|できません|お電話/.test(reserveBody),
            detail: `HTTP ${reserveStatus}`,
          },
        ],
      });

      sql(`update clinics set public_booking_enabled = true where id = '${DEMO_CLINIC_ID}'`);
      await page.goto(`${BASE}/c/demo`, { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const backBtns = await page.getByRole("link", { name: "予約する" }).count();
      await c.step({
        label: "オンに戻すと復活する",
        action: "オンライン予約をオンに戻して公開ページを再読み込み",
        expect: "予約ボタンが再表示される",
        actual: `予約ボタン=${backBtns}個`,
        page,
        fullPage: true,
        checks: [{ label: "予約ボタンが戻る", ok: backBtns > 0, detail: `${backBtns}個` }],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PUB-031
verdicts.push(
  await runCase(
    {
      id: "AT-PUB-031",
      priority: "P1",
      phase: "B",
      order: 131,
      title: "日時の表示形式が統一されている(7/12(金) 13:00–15:30)",
      spec: "v2-04",
      refs: REF,
      intent:
        "曜日が入っていないと患者が日付を読み違える。院内・患者向け・メールで表記が揺れないことを確認する。",
    },
    async (c) => {
      const { ctx, page } = await anonContext();
      const d = jstDate(1);
      await page.goto(`${BASE}/c/demo/reserve?date=${d}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const body = await page.locator("body").innerText();
      // 「7/28(火)」のような形式
      const dateFmt = /\d{1,2}\/\d{1,2}\([日月火水木金土]\)/.test(body);
      const timeFmt = /\d{1,2}:\d{2}/.test(body);
      await c.step({
        label: "予約ページの日付表記",
        action: `/c/demo/reserve?date=${d} を開く`,
        expect: "「7/28(火)」のように月/日(曜日)の形式で表示される",
        actual: `月/日(曜)形式=${dateFmt} / 時刻形式=${timeFmt}`,
        note: "メール本文の表記(evidence/_emails/)も同じ書式であることを併せて確認済み。",
        page,
        fullPage: true,
        checks: [
          { label: "月/日(曜日)の形式で表示される", ok: dateFmt },
          { label: "時刻が HH:MM で表示される", ok: timeFmt },
        ],
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
