// フェーズ A ① ログイン・到達性 — 実行順 1〜4
// AT-AUTH-001 / AT-AUTH-025 / AT-AUTH-008 / AT-BOOK-001
// 実行: node scripts/at-evidence/phase-a-01-auth.mjs
import { BASE, anonContext, closeBrowser, login, runCase, sql, sqlOne, summarize } from "./lib.mjs";

const OWNER_NAV = [
  "予約台帳",
  "施術枠",
  "患者",
  "メニュー",
  "部屋・担当",
  "問診テンプレ",
  "スタッフ",
  "クリニック設定",
];
const STAFF_NAV = ["予約台帳", "施術枠", "患者"];
const OWNER_ONLY = ["メニュー", "部屋・担当", "問診テンプレ", "スタッフ", "クリニック設定"];
const verdicts = [];

/** サイドバー(md 以上で表示)に見えているナビのラベル一覧 */
async function navLabels(page) {
  const found = [];
  for (const label of OWNER_NAV) {
    const n = await page.locator("aside").getByRole("link", { name: label, exact: true }).count();
    if (n > 0) found.push(label);
  }
  return found;
}

// ---------------------------------------------------------------- 実行順 1
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-001",
      priority: "P0",
      phase: "A",
      order: 1,
      title: "owner のメール+パスワードログイン → クリニックへ遷移",
      spec: "v2-01",
      refs: ["20_受け入れテスト/01_基盤・認証・スタッフ管理.md"],
      intent:
        "院長が自分のアカウントで入れること。ここが通らないと院内業務が何も始まらないため P0(リリースゲート)。",
    },
    async (c) => {
      const before = Number(
        sqlOne("select count(*) from audit_logs where action = 'auth.login'") ?? "0",
      );
      const { ctx, page } = await anonContext();

      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      const heading = await page.getByText("スタッフログイン").count();
      await c.step({
        label: "ログイン画面を開く",
        action: `${BASE}/login を開く`,
        expect: "見出し「スタッフログイン」が表示される",
        actual: `見出しの一致数=${heading}`,
        note: "画面上の文言で判定(見出しが無い＝別画面に飛んでいる可能性を排除)",
        page,
        checks: [{ label: "見出し「スタッフログイン」がある", ok: heading > 0, detail: `count=${heading}` }],
      });

      await page.fill("#email", "owner@demo.local");
      await page.fill("#password", "premake-dev");
      await c.step({
        label: "認証情報を入力",
        action: "owner@demo.local / premake-dev を入力(パスワードはマスク表示)",
        expect: "入力値がフォームに反映される",
        actual: `email 欄=${await page.inputValue("#email")}`,
        page,
        checks: [
          {
            label: "email 欄に入力が反映",
            ok: (await page.inputValue("#email")) === "owner@demo.local",
            detail: await page.inputValue("#email"),
          },
        ],
      });

      await Promise.all([
        page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 }).catch(() => {}),
        page.getByRole("button", { name: "ログイン" }).click(),
      ]);
      await page.waitForTimeout(1200);

      const url = page.url().replace(BASE, "");
      const clinicName = await page.getByText("デモクリニック").count();
      const nav = await navLabels(page);
      const missing = OWNER_NAV.filter((l) => !nav.includes(l));
      await c.step({
        label: "予約台帳へ遷移",
        action: "「ログイン」を押す",
        expect: "/demo(予約台帳)へ遷移し、クリニック名と owner 用ナビ 8 項目が表示される",
        actual: `url=${url} / クリニック名=${clinicName}件 / ナビ=${nav.join("・")}`,
        note: "所属クリニックのうち最古の 1 件へ遷移する仕様。owner は demo のみ所属のため /demo が正。",
        page,
        checks: [
          { label: "/demo へ遷移した", ok: url === "/demo", detail: `url=${url}` },
          { label: "クリニック名「デモクリニック」が見える", ok: clinicName > 0, detail: `count=${clinicName}` },
          {
            label: `owner 用ナビ 8 項目すべて表示(不足: ${missing.join("・") || "なし"})`,
            ok: missing.length === 0,
            detail: nav.join("・"),
          },
        ],
      });

      const q =
        "select action, actor_type, actor_user_id is not null as has_actor from audit_logs where action = 'auth.login' order by created_at desc limit 1";
      const rows = sql(q);
      const after = Number(sqlOne("select count(*) from audit_logs where action = 'auth.login'") ?? "0");
      const row = rows[0] ?? [];
      c.dbCheck({
        label: "監査ログに auth.login が 1 件増え、actor_type=member で記録される",
        query: q,
        expect: "action=auth.login / actor_type=member / actor_user_id が非 null / 件数が +1",
        actual: `件数 ${before}→${after} / 最新行=${row.join(", ")}`,
        ok: after === before + 1 && row[0] === "auth.login" && row[1] === "member" && row[2] === "t",
      });

      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 2
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-025",
      priority: "P0",
      phase: "A",
      order: 2,
      title: "ロール別のナビ表示と owner 専用ページの制御",
      spec: "v2-02",
      refs: ["20_受け入れテスト/01_基盤・認証・スタッフ管理.md"],
      intent:
        "看護師に院長専用の設定を触らせないこと。権限境界が崩れると料金・スタッフ・公開設定を誰でも変更できてしまうため P0。",
    },
    async (c) => {
      const owner = await login("owner@demo.local");
      const ownerNav = await navLabels(owner.page);
      await c.step({
        label: "owner のサイドバー",
        action: "owner でログインし /demo のサイドバーを確認",
        expect: "予約台帳/施術枠/患者 + 管理系 5 項目 = 8 項目",
        actual: ownerNav.join("・"),
        page: owner.page,
        checks: [{ label: "8 項目すべて表示", ok: ownerNav.length === 8, detail: `${ownerNav.length} 項目` }],
      });
      await owner.ctx.close();

      const staff = await login("nurse1@demo.local");
      const staffNav = await navLabels(staff.page);
      const leaked = staffNav.filter((l) => OWNER_ONLY.includes(l));
      await c.step({
        label: "staff のサイドバー",
        action: "nurse1(staff)でログインし /demo のサイドバーを確認",
        expect: "予約台帳/施術枠/患者 のみ。管理系リンクは非表示",
        actual: staffNav.join("・"),
        note: `owner 専用リンクの露出=${leaked.length}件`,
        page: staff.page,
        checks: [
          {
            label: "staff 用 3 項目のみ",
            ok: staffNav.length === STAFF_NAV.length && leaked.length === 0,
            detail: `表示=${staffNav.join("・")} / 露出=${leaked.join("・") || "なし"}`,
          },
        ],
      });

      // owner 専用ページへ直アクセス
      const paths = ["/demo/staff", "/demo/settings", "/demo/services", "/demo/rooms", "/demo/questionnaires"];
      const results = [];
      for (const path of paths) {
        await staff.page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
        await staff.page.waitForTimeout(400);
        const landed = staff.page.url().replace(BASE, "");
        results.push({ path, landed, ok: landed === "/demo" });
      }
      const bad = results.filter((r) => !r.ok);
      await c.step({
        label: "owner 専用 5 ページへ直アクセス",
        action: `staff のまま ${paths.join(" / ")} を URL 直打ちで開く`,
        expect: "すべて /demo(予約台帳)へリダイレクトされ、当該画面の内容は表示されない",
        actual: results.map((r) => `${r.path}→${r.landed}`).join(" / "),
        note: "requireMember(slug,'owner') が非 owner を /{slug} へ送る第 2 層の防御。",
        page: staff.page,
        checks: [
          {
            label: "5 ページすべて /demo へ弾かれる",
            ok: bad.length === 0,
            detail: bad.map((r) => `${r.path}→${r.landed}`).join(" / ") || "全て弾かれた",
          },
        ],
      });
      await staff.ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 3
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-008",
      priority: "P0",
      phase: "A",
      order: 3,
      title: "未ログインで保護ルートへ直アクセス → /login",
      spec: "v2-01",
      refs: ["20_受け入れテスト/01_基盤・認証・スタッフ管理.md"],
      intent:
        "URL を知っているだけで患者情報が見えないこと。個人情報保護の最低線であり、破れていれば即リリース不可。",
    },
    async (c) => {
      const paths = ["/demo", "/demo/settings", "/demo/staff", "/demo/patients", "/ops"];
      const rows = [];
      const { ctx, page } = await anonContext();
      for (const path of paths) {
        const resp = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(300);
        const landed = page.url().replace(BASE, "");
        const html = await page.content();
        // 保護ページの本文が混ざっていないか(クリニック名・患者名・メンバー名)
        const leakWords = ["デモクリニック", "山田 花子", "鈴木 はな", "川崎 悠"];
        const leaked = leakWords.filter((w) => html.includes(w));
        rows.push({
          path,
          landed,
          status: resp?.status(),
          leaked,
          ok: landed.startsWith("/login") && leaked.length === 0,
        });
      }
      const bad = rows.filter((r) => !r.ok);
      await c.step({
        label: "保護ルート 5 本へ未ログインでアクセス",
        action: `cookie なしで ${paths.join(" / ")} を開く`,
        expect: "すべて /login へリダイレクト。保護ページの本文(クリニック名・患者名・メンバー名)は HTML に一切含まれない",
        actual: rows.map((r) => `${r.path}→${r.landed}(漏れ:${r.leaked.length})`).join(" / "),
        note: "リダイレクト先の確認だけでなく、レスポンス HTML に保護対象の文字列が含まれないことまで検査している。",
        page,
        checks: [
          {
            label: "5 本すべて /login へ、かつ本文露出なし",
            ok: bad.length === 0,
            detail: bad.map((r) => `${r.path}→${r.landed} 漏れ=${r.leaked.join(",")}`).join(" / ") || "全て遮断",
          },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 4
verdicts.push(
  await runCase(
    {
      id: "AT-BOOK-001",
      priority: "P1",
      phase: "A",
      order: 4,
      title: "予約台帳 日ビューの表示(時間 × 部屋グリッド・JST)",
      spec: "v2-09",
      refs: ["20_受け入れテスト/03_予約台帳・予約管理.md"],
      intent: "受付が当日の予定を一目で把握できること。ここが読めないと現場が回らない。",
    },
    async (c) => {
      const staff = await login("nurse1@demo.local");
      const page = staff.page;
      await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);

      const rooms = sql(
        `select name from rooms where clinic_id = '10000000-0000-4000-a000-000000000001' and status = 'active' order by sort_order`,
      ).map((x) => x[0]);
      const roomHeaders = [];
      for (const name of rooms) {
        if ((await page.getByText(name, { exact: false }).count()) > 0) roomHeaders.push(name);
      }
      // 営業時間 10:00-19:00 の時間軸ラベル
      const hourLabels = [];
      for (const h of ["10:00", "12:00", "15:00", "18:00"]) {
        if ((await page.getByText(h, { exact: false }).count()) > 0) hourLabels.push(h);
      }

      await c.step({
        label: "台帳(日ビュー)を開く",
        action: "nurse1 で /demo を開く",
        expect: "部屋レーン(施術室1/2)と時間軸(10:00〜19:00)のグリッドが JST で描画される",
        actual: `部屋レーン=${roomHeaders.join("・")} / 時間ラベル=${hourLabels.join("・")}`,
        note: "seed の部屋名を DB から取り、その文字列が画面にあることで照合している(ハードコードしない)。",
        page,
        fullPage: true,
        checks: [
          { label: `部屋レーンが DB の部屋数(${rooms.length})分ある`, ok: roomHeaders.length === rooms.length, detail: roomHeaders.join("・") },
          { label: "時間軸ラベルが 4 点以上見える", ok: hourLabels.length >= 4, detail: hourLabels.join("・") },
        ],
      });

      // seed の確定予約(山田 花子)が当日/翌日どちらに入っているかを DB で確認し、該当日タブで見えるか
      const q = `select b.booking_no, p.name, to_char(lower(s.occupied_range) at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') as start_jst
                 from bookings b
                 join patients p on p.id = b.patient_id
                 join booking_sessions s on s.booking_id = b.id
                 where b.clinic_id = '10000000-0000-4000-a000-000000000001' and b.status = 'confirmed'
                 order by lower(s.occupied_range) limit 1`;
      const row = sql(q)[0] ?? [];
      c.dbCheck({
        label: "seed の確定予約が存在し、開始時刻が JST で取得できる",
        query: q.replace(/\s+/g, " "),
        expect: "confirmed の予約が 1 件以上",
        actual: row.length ? `${row[0]} / ${row[1]} / ${row[2]}` : "0 件",
        ok: row.length > 0,
      });

      if (row.length) {
        const dateOnly = row[2].slice(0, 10);
        await page.goto(`${BASE}/demo?d=${dateOnly}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);
        const nameSeen = await page.getByText(row[1]).count();
        const timeSeen = await page.getByText(row[2].slice(11)).count();
        await c.step({
          label: "予約チップの表示を確認",
          action: `台帳を ${dateOnly} に切り替える`,
          expect: `患者名「${row[1]}」と開始時刻 ${row[2].slice(11)} のチップが表示される`,
          actual: `患者名=${nameSeen}件 / 時刻=${timeSeen}件`,
          note: "DB の値(患者名・JST 開始時刻)を期待値に使い、画面表示と突き合わせている。",
          page,
          fullPage: true,
          checks: [
            { label: "患者名が表示される", ok: nameSeen > 0, detail: `count=${nameSeen}` },
            { label: "JST の開始時刻が表示される", ok: timeSeen > 0, detail: `count=${timeSeen}` },
          ],
        });
      }
      await staff.ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
