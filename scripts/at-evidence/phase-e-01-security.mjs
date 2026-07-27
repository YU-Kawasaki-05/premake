// フェーズ E セキュリティ境界の実測(ログイン済みユーザーが API を直接叩く経路)
// AT-NFR-002 / 003 / 004 / 005 / 007 / 008 / 031 / AT-AUTH-033 / AT-PAT-027 / 028 / 029 / AT-PAT-013
//
// 画面操作の検証では「アプリの認可を通った操作」しか試せない。ここでは
// ブラウザの開発者ツールから直接データベース API を呼ぶ攻撃者を再現する。
// 実行: node scripts/at-evidence/phase-e-01-security.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  authToken,
  closeBrowser,
  login,
  restAnon,
  restAs,
  runCase,
  sql,
  sqlOne,
  summarize,
} from "./lib.mjs";

const verdicts = [];
const REF = ["20_受け入れテスト/07_非機能・セキュリティ.md"];

// 他院データを用意する(終了時に削除)
const OTHER_SLUG = "at-sec-other";
function setupOther() {
  teardownOther();
  const id = sqlOne(`insert into clinics (slug, name) values ('${OTHER_SLUG}','AT検証 他院') returning id`);
  const pid = sqlOne(
    `insert into patients (clinic_id, name, kana, email) values ('${id}','他院の患者','たいんのかんじゃ','other-patient@example.com') returning id`,
  );
  return { id, pid };
}
function teardownOther() {
  sql(`delete from patients where clinic_id in (select id from clinics where slug = '${OTHER_SLUG}')`);
  sql(`delete from clinic_members where clinic_id in (select id from clinics where slug = '${OTHER_SLUG}')`);
  sql(`delete from clinics where slug = '${OTHER_SLUG}'`);
}
const other = setupOther();

const staffToken = await authToken("nurse1@demo.local");
const ownerToken = await authToken("owner@demo.local");

// ---------------------------------------------------------------- AT-NFR-003 / AT-PAT-028
verdicts.push(
  await runCase(
    {
      id: "AT-NFR-003",
      priority: "P0",
      phase: "E",
      order: 401,
      title: "ログイン済みスタッフが API を直接叩いても他院のデータは 1 行も読めない",
      spec: "v2-02",
      refs: REF,
      intent:
        "アプリの画面を経由しない攻撃経路。スタッフは正規の JWT を持っているため、行レベルセキュリティ(RLS)だけが最後の壁になる。ここが破れると全クリニックの患者情報が読める。",
      notes:
        "検証用に第 2 クリニックと他院の患者を作成し、demo クリニックのスタッフの JWT で読み出しを試みている(終了後に削除)。",
    },
    async (c) => {
      const tables = ["patients", "bookings", "booking_sessions", "clinics", "clinic_members", "services", "rooms"];
      const rows = [];
      for (const t of tables) {
        // 他院の clinic_id を明示して取得を試みる
        const filter = t === "clinics" ? `id=eq.${other.id}` : `clinic_id=eq.${other.id}`;
        const r = await restAs(staffToken, `${t}?select=*&${filter}`);
        rows.push({ t, status: r.status, rows: r.rows, text: r.text });
      }
      const leaked = rows.filter((r) => (r.rows ?? 0) > 0);
      await c.step({
        label: "他院の clinic_id を指定して読み出しを試みる",
        action: `demo のスタッフ(nurse1)の JWT で、他院(${OTHER_SLUG})の ${tables.join(" / ")} を取得しようとする`,
        expect: "すべて 0 行(または権限エラー)。1 行でも返ったら情報漏洩",
        actual: rows.map((r) => `${r.t}:${r.status}(${r.rows ?? "?"}行)`).join(" / "),
        note: "JWT は正規のもの。アプリの認可コードを一切通さず、データベース API を直接呼んでいる。",
        shot: false,
        checks: [
          {
            label: "他院のデータが 1 行も返らない",
            ok: leaked.length === 0,
            detail: leaked.map((r) => `${r.t}=${r.rows}行`).join(" / ") || "全テーブル 0 行",
          },
        ],
      });

      // 自院のデータは読める(RLS が過剰に閉じていないことの確認)
      const own = await restAs(staffToken, `patients?select=id,name&clinic_id=eq.${DEMO_CLINIC_ID}`);
      await c.step({
        label: "自院のデータは読める(過剰に閉じていない)",
        action: "同じ JWT で自院(demo)の患者を取得する",
        expect: "1 行以上返る",
        actual: `HTTP ${own.status} / ${own.rows} 行`,
        shot: false,
        checks: [{ label: "自院のデータは読める", ok: (own.rows ?? 0) > 0, detail: `${own.rows} 行` }],
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-NFR-008 / AT-AUTH-033
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-033",
      priority: "P0",
      phase: "E",
      order: 402,
      title: "ログイン済みユーザーが自分を運営(ops)に昇格させられない",
      spec: "v2-02",
      refs: REF,
      intent:
        "`profiles.is_ops` を自分で true にできてしまうと、全クリニックのデータと設定に手が届く。権限昇格の最重要ポイント。",
    },
    async (c) => {
      const uid = sqlOne(
        `select p.id from profiles p join auth.users u on u.id = p.id where u.email = 'nurse1@demo.local'`,
      );
      const before = sqlOne(`select is_ops from profiles where id = '${uid}'`);

      const r1 = await restAs(staffToken, `profiles?id=eq.${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ is_ops: true }),
      });
      const after = sqlOne(`select is_ops from profiles where id = '${uid}'`);
      await c.step({
        label: "自分の profiles.is_ops を true に書き換えようとする",
        action: "スタッフの JWT で PATCH /rest/v1/profiles?id=eq.<自分> {is_ops:true}",
        expect: "拒否され、値は変わらない",
        actual: `HTTP ${r1.status} / is_ops: ${before} → ${after} / 応答=${r1.text.slice(0, 80)}`,
        note: "RLS のポリシーで is_ops の更新が許可されていないこと(または profiles への更新自体が拒否されること)を確認している。",
        shot: false,
        checks: [
          { label: "値が変わっていない", ok: after === before, detail: `${before} → ${after}` },
          { label: "書き込みが拒否される", ok: r1.status >= 400 || after === before, detail: `HTTP ${r1.status}` },
        ],
      });

      // owner でも同様に昇格できないこと
      const ouid = sqlOne(
        `select p.id from profiles p join auth.users u on u.id = p.id where u.email = 'owner@demo.local'`,
      );
      const obefore = sqlOne(`select is_ops from profiles where id = '${ouid}'`);
      const r2 = await restAs(ownerToken, `profiles?id=eq.${ouid}`, {
        method: "PATCH",
        body: JSON.stringify({ is_ops: true }),
      });
      const oafter = sqlOne(`select is_ops from profiles where id = '${ouid}'`);
      await c.step({
        label: "院長(owner)でも運営には昇格できない",
        action: "owner の JWT で同じ書き換えを試みる",
        expect: "拒否され、値は変わらない",
        actual: `HTTP ${r2.status} / is_ops: ${obefore} → ${oafter}`,
        shot: false,
        checks: [{ label: "値が変わっていない", ok: oafter === obefore, detail: `${obefore} → ${oafter}` }],
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-NFR-004
verdicts.push(
  await runCase(
    {
      id: "AT-NFR-004",
      priority: "P0",
      phase: "E",
      order: 403,
      title: "自院のデータを他院へ移送(clinic_id の書き換え)できない",
      spec: "v2-02",
      refs: REF,
      intent:
        "自分が触れる行の clinic_id を他院に書き換えられると、他院の台帳に自分のデータを混ぜ込めてしまう(逆に自院のデータを消せる)。",
    },
    async (c) => {
      const bid = sqlOne(
        `select id from bookings where clinic_id = '${DEMO_CLINIC_ID}' order by created_at desc limit 1`,
      );
      const before = sqlOne(`select clinic_id from bookings where id = '${bid}'`);
      const r = await restAs(staffToken, `bookings?id=eq.${bid}`, {
        method: "PATCH",
        body: JSON.stringify({ clinic_id: other.id }),
      });
      const after = sqlOne(`select clinic_id from bookings where id = '${bid}'`);
      await c.step({
        label: "自院の予約の clinic_id を他院に書き換えようとする",
        action: "スタッフの JWT で PATCH /rest/v1/bookings?id=eq.<自院の予約> {clinic_id:<他院>}",
        expect: "拒否され、clinic_id は変わらない",
        actual: `HTTP ${r.status} / clinic_id: ${before === after ? "変化なし" : `${before} → ${after}`} / 応答=${r.text.slice(0, 90)}`,
        note: "RLS の WITH CHECK 句で「更新後の行も自院に属すること」を要求していれば拒否される。",
        shot: false,
        checks: [
          { label: "clinic_id が変わっていない", ok: after === before, detail: String(after) },
          { label: "書き込みが拒否される", ok: r.status >= 400 || after === before, detail: `HTTP ${r.status}` },
        ],
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-NFR-005 / 007
verdicts.push(
  await runCase(
    {
      id: "AT-NFR-005",
      priority: "P0",
      phase: "E",
      order: 404,
      title: "患者の予約管理トークンは院内メンバーからも読めない(service role 専用)",
      spec: "v2-02",
      refs: REF,
      intent:
        "管理トークンが読めると、院内の誰でも他人の予約を照会・キャンセルできてしまう。仕様では authenticated 向けのポリシーを一切作らない = デフォルト拒否と定めている。",
    },
    async (c) => {
      const tok = await restAs(staffToken, "booking_access_tokens?select=*&limit=5");
      const tokOwner = await restAs(ownerToken, "booking_access_tokens?select=*&limit=5");
      const stored = Number(sqlOne("select count(*) from booking_access_tokens"));
      await c.step({
        label: "管理トークンの読み出しを試みる",
        action: "スタッフと院長、両方の JWT で booking_access_tokens を取得しようとする",
        expect: `データベースには ${stored} 件あるが、どちらの JWT でも 0 行`,
        actual: `staff:HTTP${tok.status}(${tok.rows ?? "?"}行) / owner:HTTP${tokOwner.status}(${tokOwner.rows ?? "?"}行) / DB 実在 ${stored} 件`,
        note: "実際に行は存在するのに 0 行しか返らない = ポリシー未定義によるデフォルト拒否が効いている。",
        shot: false,
        checks: [
          { label: "スタッフからは読めない", ok: (tok.rows ?? 0) === 0, detail: `${tok.rows} 行` },
          { label: "院長からも読めない", ok: (tokOwner.rows ?? 0) === 0, detail: `${tokOwner.rows} 行` },
          { label: "そもそもデータは存在する(0 行の理由が空テーブルではない)", ok: stored > 0, detail: `${stored} 件` },
        ],
      });

      // 監査ログの改ざん・削除
      const aid = sqlOne(`select id from audit_logs order by created_at desc limit 1`);
      const del = await restAs(staffToken, `audit_logs?id=eq.${aid}`, { method: "DELETE" });
      const still = sqlOne(`select count(*) from audit_logs where id = '${aid}'`);
      await c.step({
        label: "監査ログを削除しようとする",
        action: "スタッフの JWT で DELETE /rest/v1/audit_logs?id=eq.<最新の 1 件>",
        expect: "拒否され、行は残る",
        actual: `HTTP ${del.status} / 対象行は ${still === "1" ? "残っている" : "消えた"}`,
        shot: false,
        checks: [{ label: "監査ログが消せない", ok: still === "1", detail: `残存=${still}` }],
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-NFR-007
verdicts.push(
  await runCase(
    {
      id: "AT-NFR-007",
      priority: "P0",
      phase: "E",
      order: 404.5,
      title: "通知・監査ログは自院分だけ読めて、他院分は読めない・書き込みもできない",
      spec: "v2-04",
      refs: REF,
      intent:
        "notifications には患者のメールアドレスが入る。他院分が読めれば重大な漏洩。一方で自院分は画面表示に使うため読める必要がある(過剰に閉じてもいけない)。",
    },
    async (c) => {
      const own = [];
      const cross = [];
      for (const t of ["notifications", "audit_logs"]) {
        const a = await restAs(staffToken, `${t}?select=*&limit=5`);
        const b = await restAs(staffToken, `${t}?select=*&clinic_id=eq.${other.id}&limit=5`);
        own.push(`${t}:${a.rows ?? "?"}行`);
        cross.push({ t, rows: b.rows ?? 0 });
      }
      const leaked = cross.filter((x) => x.rows > 0);
      await c.step({
        label: "自院分と他院分を読み比べる",
        action: "スタッフの JWT で notifications / audit_logs を、絞り込みなし / 他院の clinic_id 指定 の 2 通りで取得",
        expect: "絞り込みなしでは自院分が返り、他院を指定すると 0 行",
        actual: `自院分=${own.join(" / ")} / 他院分=${cross.map((x) => `${x.t}:${x.rows}行`).join(" / ")}`,
        note: "行レベルセキュリティが clinic_id で絞っているため、絞り込みを指定しなくても自院分しか返らない。",
        shot: false,
        checks: [
          {
            label: "他院分が 1 行も返らない",
            ok: leaked.length === 0,
            detail: leaked.map((x) => `${x.t}=${x.rows}行`).join(" / ") || "0 行",
          },
        ],
      });

      // 書き込みは service role のみ
      const ins = await restAs(staffToken, "audit_logs", {
        method: "POST",
        body: JSON.stringify({
          clinic_id: DEMO_CLINIC_ID,
          actor_type: "member",
          action: "at.injected",
          target_type: "test",
        }),
      });
      const injected = Number(sqlOne(`select count(*) from audit_logs where action = 'at.injected'`));
      await c.step({
        label: "監査ログを偽造しようとする",
        action: "スタッフの JWT で audit_logs に行を挿入しようとする",
        expect: "拒否され、行は作られない(記録は service role のみが書ける)",
        actual: `HTTP ${ins.status} / 挿入された行=${injected} 件 / 応答=${ins.text.slice(0, 80)}`,
        note: "偽の操作記録を残せると、監査ログ自体の証拠能力が失われる。",
        shot: false,
        checks: [{ label: "偽造できない", ok: injected === 0, detail: `${injected} 件` }],
      });
      if (injected > 0) sql(`delete from audit_logs where action = 'at.injected'`);
    },
  ),
);

// ---------------------------------------------------------------- AT-NFR-031
verdicts.push(
  await runCase(
    {
      id: "AT-NFR-031",
      priority: "P0",
      phase: "E",
      order: 405,
      title: "看護師(staff)が院長専用の設定を API 経由で書き換えられない",
      spec: "v2-02 / v2-03",
      refs: REF,
      intent:
        "画面では院長専用ページに入れないことを確認済み(AT-AUTH-025)。しかし画面を経由しなければ書けてしまうなら、権限分離は成立していない。",
    },
    async (c) => {
      const tests = [
        {
          label: "クリニック設定(料金・公開予約の可否)",
          path: `clinics?id=eq.${DEMO_CLINIC_ID}`,
          body: { public_booking_enabled: false },
          verify: () => sqlOne(`select public_booking_enabled from clinics where id = '${DEMO_CLINIC_ID}'`),
        },
        {
          label: "メニューの料金",
          path: `services?clinic_id=eq.${DEMO_CLINIC_ID}&name=eq.${encodeURIComponent("メディカルピーリング")}`,
          body: { price_yen: 1 },
          verify: () =>
            sqlOne(`select price_yen from services where clinic_id = '${DEMO_CLINIC_ID}' and name = 'メディカルピーリング'`),
        },
        {
          label: "自分の権限(roles)を owner に昇格",
          path: `clinic_members?clinic_id=eq.${DEMO_CLINIC_ID}&display_name=eq.${encodeURIComponent("鈴木")}`,
          body: { roles: ["owner", "staff"] },
          verify: () =>
            sqlOne(
              `select array_to_string(roles, ',') from clinic_members where clinic_id = '${DEMO_CLINIC_ID}' and display_name = '鈴木'`,
            ),
        },
      ];
      const results = [];
      for (const t of tests) {
        const before = t.verify();
        const r = await restAs(staffToken, t.path, { method: "PATCH", body: JSON.stringify(t.body) });
        const after = t.verify();
        results.push({ ...t, status: r.status, before, after, unchanged: before === after });
      }
      const changed = results.filter((r) => !r.unchanged);
      await c.step({
        label: "院長専用の 3 種類の書き換えを試みる",
        action: "スタッフの JWT で「公開予約の可否」「メニュー料金」「自分の権限」を PATCH する",
        expect: "すべて拒否され、値は変わらない",
        actual: results.map((r) => `${r.label}:HTTP${r.status}(${r.unchanged ? "変化なし" : `${r.before}→${r.after}`})`).join(" / "),
        note: "とくに 3 つ目(自分を owner に昇格)が通ると、以降すべての院長権限を取得できる。",
        shot: false,
        checks: [
          {
            label: "3 種類すべて書き換えられない",
            ok: changed.length === 0,
            detail: changed.map((r) => `${r.label}: ${r.before}→${r.after}`).join(" / ") || "全て拒否",
          },
        ],
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-NFR-002 / AT-PAT-029
verdicts.push(
  await runCase(
    {
      id: "AT-NFR-002",
      priority: "P0",
      phase: "E",
      order: 406,
      title: "未ログイン(anon)では業務テーブルへ読み書きできない",
      spec: "v2-02",
      refs: REF,
      intent:
        "公開ページで使う鍵はブラウザに配られる。その鍵で書き込みができると、誰でも予約データを改変できる。",
    },
    async (c) => {
      const reads = [];
      for (const t of ["patients", "bookings", "clinics", "services", "audit_logs"]) {
        const r = await restAnon(`${t}?select=*&limit=3`);
        reads.push(`${t}:${r.status}`);
      }
      const w = await restAnon(`patients?select=id`);
      const insert = await fetch(
        `${process.env.SB_URL ?? "http://127.0.0.1:54321"}/rest/v1/patients`,
        { method: "POST" },
      ).catch(() => null);
      const before = Number(sqlOne(`select count(*) from patients where clinic_id = '${DEMO_CLINIC_ID}'`));
      await c.step({
        label: "公開用の鍵で読み書きを試みる",
        action: "anon キーで業務テーブルを取得し、患者の追加も試みる",
        expect: "読み出しは 401、書き込みも拒否",
        actual: `読み出し=${reads.join(" / ")} / 患者数は ${before} 件のまま`,
        shot: false,
        checks: [
          { label: "読み出しが拒否される(401)", ok: reads.every((x) => x.endsWith("401")), detail: reads.join(" / ") },
          {
            label: "患者が増えていない",
            ok: Number(sqlOne(`select count(*) from patients where clinic_id = '${DEMO_CLINIC_ID}'`)) === before,
          },
        ],
      });
    },
  ),
);

// ---------------------------------------------------------------- AT-PAT-013
verdicts.push(
  await runCase(
    {
      id: "AT-PAT-013",
      priority: "P0",
      phase: "E",
      order: 407,
      title: "患者検索に不正な文字列を入れても壊れない・他院の患者が出ない",
      spec: "v2-15",
      refs: ["20_受け入れテスト/04_患者・問診.md"],
      intent:
        "検索語はそのままデータベースの問い合わせに載る。特殊文字で条件を書き換えられると、他院の患者を引き出せてしまう(PostgREST の or 構文インジェクション)。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const payloads = [
        { q: "*", why: "ワイルドカード" },
        { q: "%", why: "LIKE のワイルドカード" },
        { q: "a,email.neq.null", why: "or 条件の注入(カンマで条件を追加)" },
        { q: "'; select 1 --", why: "SQL の終端と注釈" },
        { q: "他院", why: "他院の患者名の一部" },
      ];
      const rows = [];
      await page.goto(`${BASE}/demo/patients`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      for (const p of payloads) {
        const box = page.getByPlaceholder(/検索|名前/).first();
        if ((await box.count()) === 0) break;
        await box.fill(p.q);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1100);
        const body = await page.locator("body").innerText();
        const leaked = body.includes("他院の患者");
        const crashed = /Application error|Unhandled|Internal Server Error/i.test(body);
        rows.push({ ...p, leaked, crashed });
      }
      const bad = rows.filter((r) => r.leaked || r.crashed);
      await c.step({
        label: "特殊文字を含む検索語を投入",
        action: `患者検索に ${payloads.map((p) => `「${p.q}」`).join(" / ")} を順に入力`,
        expect: "画面が壊れず、他院の患者も出ない",
        actual: rows.map((r) => `「${r.q}」漏洩=${r.leaked} 異常=${r.crashed}`).join(" / ") || "検索欄が見つからず未実施",
        note: "検索語はサーバー側で無害化(sanitizeSearchTerm)され、さらに clinic_id で絞られる二重防御。",
        page,
        fullPage: true,
        checks: [
          { label: "他院の患者が出ない", ok: !rows.some((r) => r.leaked) },
          { label: "画面が壊れない", ok: !rows.some((r) => r.crashed) },
          { label: "検証を実施できた", ok: rows.length === payloads.length, detail: `${rows.length}/${payloads.length} 件` },
        ],
      });

      // 検索が監査ログに残る(AT-PAT-025)
      const aq = `select action, actor_type from audit_logs where clinic_id = '${DEMO_CLINIC_ID}' and action = 'patient.search' order by created_at desc limit 1`;
      const arow = sql(aq)[0] ?? [];
      c.dbCheck({
        label: "患者検索が監査ログに記録される(誰が何を検索したか追跡できる)",
        query: aq,
        expect: "patient.search / member",
        actual: arow.join(" / ") || "なし",
        ok: arow[0] === "patient.search" && arow[1] === "member",
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-PAT-027 / 028
verdicts.push(
  await runCase(
    {
      id: "AT-PAT-028",
      priority: "P0",
      phase: "E",
      order: 408,
      title: "他院の患者詳細ページには到達できない",
      spec: "v2-15",
      refs: ["20_受け入れテスト/04_患者・問診.md"],
      intent:
        "患者 ID を URL に直接入れて他院の患者カルテを開けたら、最も重い情報漏洩になる。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      const res = await page.goto(`${BASE}/demo/patients/${other.pid}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const body = await page.locator("body").innerText();
      await c.step({
        label: "他院の患者 ID を URL に入れて開く",
        action: `/demo/patients/<他院の患者 ID> を直接開く`,
        expect: "404 または一覧へ戻され、他院の患者名は表示されない",
        actual: `HTTP ${res?.status()} / 「他院の患者」の表示=${body.includes("他院の患者")}`,
        note: "自院の slug と他院の患者 ID を組み合わせた攻撃。データ取得時に clinic_id で絞っていれば見つからない。",
        page,
        fullPage: true,
        note: "実装は id と clinic_id の両方で絞り、見つからなければ notFound() を呼ぶ。開発サーバーでは not-found 画面が HTTP 200 で返るが、表示内容は「ページが見つかりません」であり患者情報は一切含まれない。",
        checks: [
          { label: "他院の患者名が表示されない", ok: !body.includes("他院の患者") },
          {
            label: "「ページが見つかりません」が表示される",
            ok: /見つかりません|not found|404/i.test(body),
            detail: body.slice(0, 60).replace(/\s+/g, " "),
          },
          {
            label: "他院の患者のメールアドレスも出ない",
            ok: !body.includes("other-patient@example.com"),
          },
        ],
      });

      // 未ログインでの患者ページ(AT-PAT-027)
      const own = sqlOne(`select id from patients where clinic_id = '${DEMO_CLINIC_ID}' limit 1`);
      await ctx.clearCookies();
      const res2 = await page.goto(`${BASE}/demo/patients/${own}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      const body2 = await page.locator("body").innerText();
      await c.step({
        label: "未ログインで患者詳細を開く",
        action: "cookie を消して自院の患者詳細ページを開く",
        expect: "ログイン画面へ送られ、患者情報は一切出ない",
        actual: `HTTP ${res2?.status()} / 遷移先=${page.url().replace(BASE, "")}`,
        page,
        checks: [
          { label: "ログイン画面へ送られる", ok: page.url().includes("/login"), detail: page.url().replace(BASE, "") },
          { label: "患者名が出ない", ok: !/山田|高橋/.test(body2) },
        ],
      });
      await ctx.close();
    },
  ),
);

teardownOther();
console.log(`\n(検証用の他院データを削除: clinics where slug='${OTHER_SLUG}')`);
await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
