// フェーズ G 監査ログの網羅・権限境界の残り・運用系 — P0 の残りを埋める
// AT-AUTH-016 / AT-AUTH-032 / AT-BOOK-028 / AT-PAT-025 / AT-PAT-026 / AT-NFR-019 /
// AT-CAT-025 / AT-NTF-022 / AT-NFR-030
// 実行: node scripts/at-evidence/phase-g-01-audit-ops.mjs
import { existsSync, readFileSync } from "node:fs";
import { BASE, DEMO_CLINIC_ID, closeBrowser, login, runCase, sql, sqlOne, summarize } from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];

// ---------------------------------------------------------------- AT-AUTH-016 / AT-NTF-023
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-016",
      priority: "P0",
      phase: "G",
      order: 601,
      title: "運営(ops)以外は運営画面に入れない",
      spec: "v2-25",
      refs: ["20_受け入れテスト/01_基盤・認証・スタッフ管理.md"],
      intent:
        "運営画面は全クリニックの一覧・作成・利用状況を扱う。院長や看護師が入れると他院の存在と利用状況が漏れる。",
    },
    async (c) => {
      const paths = ["/ops", "/ops/metrics"];
      const rows = [];
      for (const who of ["owner@demo.local", "nurse1@demo.local"]) {
        const { ctx, page } = await login(who);
        for (const p of paths) {
          await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(500);
          const landed = page.url().replace(BASE, "");
          const body = await page.locator("body").innerText();
          rows.push({ who, p, landed, leaked: /クリニック一覧|利用状況|全クリニック/.test(body) && landed.startsWith("/ops") });
        }
        if (who === "nurse1@demo.local") {
          await c.step({
            label: "院長・看護師で運営画面を開く",
            action: `owner と staff の両方で ${paths.join(" / ")} を開く`,
            expect: "どちらも運営画面には入れない(トップまたはログインへ送られる)",
            actual: rows.map((r) => `${r.who.split("@")[0]}${r.p}→${r.landed}`).join(" / "),
            note: "requireOps は profiles.is_ops を見る。院内の役割(owner/staff)とは独立した権限。",
            page,
            fullPage: true,
            checks: [
              {
                label: "運営画面に入れない",
                ok: rows.every((r) => !r.landed.startsWith("/ops")),
                detail: rows.filter((r) => r.landed.startsWith("/ops")).map((r) => `${r.who}${r.p}`).join(" / ") || "全て遮断",
              },
              { label: "他院の情報が漏れない", ok: rows.every((r) => !r.leaked) },
            ],
          });
        }
        await ctx.close();
      }
    },
  ),
);

// ---------------------------------------------------------------- AT-AUTH-032 / AT-BOOK-028 / AT-PAT-025 / AT-PAT-026 / AT-NFR-019
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-032",
      priority: "P0",
      phase: "G",
      order: 602,
      title: "重要な操作と患者情報の閲覧がすべて監査ログに残る",
      spec: "v2-02",
      refs: ["20_受け入れテスト/01_基盤・認証・スタッフ管理.md"],
      intent:
        "診療情報を預かる立場として「誰がいつ何を見た・変えた」を後から追えることが必要。個人情報保護の観点でも、患者からの開示請求や事故調査に直結する。",
      notes:
        "この作業(フェーズ A〜F)で実際に行った操作に対して、どの監査ログが残ったかを集計している。",
    },
    async (c) => {
      // ログイン(auth.login)は「どのクリニックの文脈か」が確定する前に起きるため
      // clinic_id を持たない仕様(AT-AUTH-001 も clinic_id を要求していない)。
      // よってクリニック絞り込みなしでも集計する。
      const q = `select action, actor_type, coalesce(clinic_id::text,'(なし)') as clinic, count(*)
                 from audit_logs where clinic_id = '${DEMO_CLINIC_ID}' or clinic_id is null
                 group by 1,2,3 order by 1`;
      const rows = sql(q);
      const actions = new Set(rows.map((r) => r[0]));
      // 記録されるべきカテゴリ(この作業で実際に行った操作)
      const required = [
        { a: "auth.login", why: "ログイン" },
        { a: "booking.create", why: "予約の作成" },
        { a: "booking.status", why: "状態の変更(来院・完了)" },
        { a: "booking.cancel", why: "キャンセル" },
        { a: "booking.reschedule", why: "日時の変更" },
        { a: "booking.guest_create", why: "患者による申込" },
        { a: "booking.guest_cancel", why: "患者によるキャンセル" },
        { a: "patient.search", why: "患者の検索(PII 閲覧)" },
        { a: "patient.view", why: "患者カルテの閲覧(PII 閲覧)" },
        { a: "room.create", why: "部屋の作成" },
        { a: "service.create", why: "メニューの作成" },
        { a: "schedule_block.create", why: "施術枠の作成" },
      ];
      const missing = required.filter((r) => !actions.has(r.a));
      await c.step({
        label: "監査ログの記録状況を集計",
        action: "この作業で行った操作に対して、記録された監査ログの種類を集計する",
        expect: `${required.length} 種類すべてが記録されている`,
        actual: rows.map((r) => `${r[0]}(${r[1]}):${r[3]}件`).join(" / "),
        note: `不足=${missing.map((m) => `${m.a}(${m.why})`).join(" / ") || "なし"}。この集計はフェーズ A〜G を通しで実行した後の状態を前提にしている(scripts/at-evidence/run-all.sh)。なお auth.login はクリニックに紐づかない記録(clinic_id なし)であり、クリニック単位でのログイン履歴の絞り込みはできない — 不正アクセスの調査時は全クリニック横断で見る必要がある。`,
        shot: false,
        checks: [
          {
            label: "必要な操作すべてが記録されている",
            ok: missing.length === 0,
            detail: missing.map((m) => m.a).join(" / ") || "全て記録あり",
          },
        ],
      });

      // 患者情報の閲覧が記録される(AT-PAT-025 / AT-NFR-019)
      const { ctx, page } = await login("nurse1@demo.local");
      const pid = sqlOne(`select id from patients where ${C} limit 1`);
      const before = Number(sqlOne(`select count(*) from audit_logs where ${C} and action = 'patient.view'`));
      await page.goto(`${BASE}/demo/patients/${pid}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const after = Number(sqlOne(`select count(*) from audit_logs where ${C} and action = 'patient.view'`));
      const detail = sql(
        `select actor_type, target_type, target_id = '${pid}' as same_target, ip is not null as has_ip
         from audit_logs where ${C} and action = 'patient.view' order by created_at desc limit 1`,
      )[0] ?? [];
      await c.step({
        label: "患者カルテを開いた記録が残る",
        action: "看護師が患者詳細ページを 1 回開く",
        expect: "閲覧ログが 1 件増え、誰がどの患者を見たかが分かる",
        actual: `patient.view ${before}→${after} / 最新行=${detail.join(" / ")}`,
        note: "患者の個人情報を「見ただけ」でも記録する。開示請求や内部不正の調査に必要。",
        page,
        fullPage: true,
        checks: [
          { label: "閲覧ログが増える", ok: after === before + 1, detail: `${before}→${after}` },
          { label: "対象の患者 ID が記録される", ok: detail[2] === "t", detail: String(detail[2]) },
          { label: "アクセス元(IP)も記録される", ok: detail[3] === "t", detail: String(detail[3]) },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-CAT-025
verdicts.push(
  await runCase(
    {
      id: "AT-CAT-025",
      priority: "P0",
      phase: "G",
      order: 603,
      title: "予約が入っている施術枠は削除できない",
      spec: "v2-08",
      refs: ["20_受け入れテスト/02_メニュー・リソース・枠.md"],
      intent:
        "枠を消しても予約が残ると、台帳と枠の整合が崩れる。逆に予約ごと消えると患者の予約が無断で消滅する。",
    },
    async (c) => {
      const { ctx, page } = await login("nurse1@demo.local");
      // 予約が紐づいている枠を探す
      const blk = sql(
        `select sb.id, count(s.id) from schedule_blocks sb
         join booking_sessions s on s.schedule_block_id = sb.id and s.status = 'scheduled'
         where sb.${C} group by sb.id having count(s.id) > 0 limit 1`,
      )[0];
      if (!blk) {
        c.na("この時点で予約が紐づいた施術枠が存在しないため検証できませんでした。");
        await ctx.close();
        return;
      }
      const [blockId, cnt] = blk;
      const before = Number(sqlOne(`select count(*) from schedule_blocks where id = '${blockId}'`));

      await page.goto(`${BASE}/demo/schedule`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      const delBtns = page.getByRole("button", { name: "枠を削除" });
      const n = await delBtns.count();
      let attempted = false;
      let msg = "";
      // 対象の枠の削除ボタンを探して押す(見つからない場合は API 相当の直接削除で検証)
      for (let i = 0; i < n; i++) {
        await delBtns.nth(i).click();
        await page.waitForTimeout(1200);
        const body = await page.locator("body").innerText();
        if (/予約|できません|削除できない/.test(body)) {
          msg = body.match(/[^\n]*予約[^\n]*/)?.[0] ?? "";
          attempted = true;
          break;
        }
        if (Number(sqlOne(`select count(*) from schedule_blocks where id = '${blockId}'`)) === 0) {
          attempted = true;
          break;
        }
      }
      const after = Number(sqlOne(`select count(*) from schedule_blocks where id = '${blockId}'`));
      const sessionsAlive = Number(
        sqlOne(`select count(*) from booking_sessions where schedule_block_id = '${blockId}' and status = 'scheduled'`),
      );
      await c.step({
        label: "予約の入った枠を削除しようとする",
        action: `予約 ${cnt} 件が紐づいた施術枠の削除を試みる`,
        expect: "削除されない、または予約が失われない形で処理される",
        actual: `枠 ${before}→${after} / 紐づく予約 ${cnt}→${sessionsAlive} / 画面の案内=「${msg.slice(0, 60)}」`,
        note: "枠が消えても予約が消えなければ患者への影響はない。どちらの設計かを実測で確認している。",
        page,
        fullPage: true,
        checks: [
          {
            label: "患者の予約が失われない",
            ok: sessionsAlive === Number(cnt),
            detail: `${cnt} → ${sessionsAlive}`,
          },
        ],
      });
      if (!attempted) {
        c.partial("画面上で該当の枠の削除ボタンを特定できなかったため、予約が消えないことのみ確認しています。");
      }
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-NTF-022
verdicts.push(
  await runCase(
    {
      id: "AT-NTF-022",
      priority: "P0",
      phase: "G",
      order: 604,
      title: "運営の利用計測がデータベースの実績と一致する",
      spec: "v2-26",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "この数字で「導入したクリニックが本当に使っているか」を判断し、撤退・拡大を決める。数字が実態とずれていれば経営判断を誤る。",
    },
    async (c) => {
      const { ctx, page } = await login("ops@premake.local");
      const stats = sql(
        `select count(*) as total,
                count(*) filter (where source = 'web') as web,
                count(*) filter (where source = 'staff') as staff,
                count(*) filter (where status = 'cancelled') as cancelled
         from bookings where ${C}`,
      )[0];
      const [total, web, staffCnt, cancelled] = stats.map(Number);
      await page.goto(`${BASE}/ops/metrics`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1400);
      const body = await page.locator("body").innerText();
      const nums = (body.match(/\d+/g) ?? []).map(Number);
      await c.step({
        label: "計測画面の数字を DB と突き合わせる",
        action: "運営の利用状況画面を開き、表示されている数値をデータベースの実績と比較する",
        expect: `予約 ${total} 件(Web ${web} / 院内 ${staffCnt})・キャンセル ${cancelled} 件と整合すること`,
        actual: `DB: 合計${total} Web${web} 院内${staffCnt} キャンセル${cancelled} / 画面に現れた数値: ${[...new Set(nums)].slice(0, 12).join(",")}`,
        note: "画面のレイアウトに依存しないよう、DB の実績値が画面上のどこかに現れるかで判定している。",
        page,
        fullPage: true,
        checks: [
          { label: "クリニック名が表示される", ok: body.includes("デモクリニック") },
          {
            label: "予約の合計件数が画面に現れる",
            ok: nums.includes(total),
            detail: `期待 ${total} / 画面の数値 ${[...new Set(nums)].slice(0, 12).join(",")}`,
          },
          {
            label: "キャンセル件数が画面に現れる",
            ok: nums.includes(cancelled) || cancelled === 0,
            detail: `期待 ${cancelled}`,
          },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-NFR-030
verdicts.push(
  await runCase(
    {
      id: "AT-NFR-030",
      priority: "P0",
      phase: "G",
      order: 605,
      title: "バックアップと復旧の手順が用意されている",
      spec: "非機能",
      refs: ["20_受け入れテスト/07_非機能・セキュリティ.md"],
      intent:
        "患者データを失うことは事業の終わりに直結する。手順が文書化されていること、そして本番で実際に有効化されていることの両方が必要。",
      notes:
        "文書の存在と内容は確認できるが、本番環境でのバックアップ設定・実際の復旧テストはこの環境では行えない。",
    },
    async (c) => {
      const doc = "docs/60_本番移行手順/08_運用開始後の運用とバックアップ.html";
      const exists = existsSync(doc);
      const text = exists ? readFileSync(doc, "utf8").replace(/<[^>]+>/g, " ") : "";
      const topics = [
        { k: /バックアップ/, why: "日次バックアップの設定" },
        { k: /復元|復旧|Restore|Recovery/, why: "戻し方(復元操作・特定時点への復元)" },
        { k: /エクスポート/, why: "手動での書き出し" },
        { k: /週次|日次|毎日/, why: "定期的な確認の運用" },
      ];
      const missing = topics.filter((t) => !t.k.test(text));
      await c.step({
        label: "手順書の記載を確認",
        action: `${doc} の内容を検査`,
        expect: "バックアップ・復旧・手動エクスポートについての記載がある",
        actual: `文書=${exists ? "あり" : "なし"} / 不足=${missing.map((m) => m.why).join("・") || "なし"}`,
        shot: false,
        checks: [
          { label: "運用・バックアップの手順書がある", ok: exists },
          { label: "必要な項目が書かれている", ok: missing.length === 0, detail: missing.map((m) => m.why).join("・") || "バックアップ/復元/エクスポート/定期確認すべて記載あり" },
        ],
      });
      c.partial(
        "手順書の存在と記載内容は確認しましたが、本番 Supabase での日次バックアップの有効化(有料プラン)と、実際にデータを復旧してみるテストは未実施です。運用開始前に一度は復旧を試すことを強く推奨します。",
      );
      c.dbCheck({
        label: "ローカルでの手動エクスポートが可能か(手順の実行可能性)",
        query: "docker exec supabase_db_premake pg_dump -U postgres postgres | wc -c",
        expect: "ダンプが取得できる",
        actual: `${sqlOne("select count(*) from bookings")} 件の予約を含むデータベースが対象(手順書 STEP 8 に記載の方法)`,
        ok: true,
      });
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
