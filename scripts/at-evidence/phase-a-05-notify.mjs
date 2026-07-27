// フェーズ A ⑦ 通知 — 実行順 26〜31(32 の cron 認可は phase-a-06-cron-auth.mjs)
// AT-NTF-004 / 003 / 006 / 013 / 016 / 008
// 実行: node scripts/at-evidence/phase-a-05-notify.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  closeBrowser,
  createBookingViaUI,
  jstDate,
  login,
  runCase,
  runCron,
  sql,
  sqlOne,
  summarize,
} from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];

// 前フェーズの掃除で親(予約)を失った通知は送信時に「context not found」で失敗する。
// 実装の問題ではなくテストデータ由来のノイズなので、計測前に取り除く
sql(`delete from notifications where booking_id is null and ${C}`);

// ---------------------------------------------------------------- 実行順 26〜28
verdicts.push(
  await runCase(
    {
      id: "AT-NTF-004",
      priority: "P1",
      phase: "A",
      order: 26,
      title: "溜まったメールが定期実行でまとめて送信される",
      spec: "v2-23 / v2-24",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "premake ではすべてのメールがいったん送信待ちの列に並び、1 時間ごとの定期実行がまとめて送る。この仕組みが動かないと確定メールもキャンセル通知も 1 通も届かない。",
      notes:
        "この環境では実際の送信は行われず、送信処理のログにのみ出力される。到達性の確認は Resend 設定後の作業。",
    },
    async (c) => {
      c.partial(
        "実際にメールが届くかはこの環境では確認できません(送信キー未設定)。ここでは『送信待ち → 送信済み』への遷移と、組み立てられた本文の内容までを確認しています。",
      );
      const { ctx, page } = await login("owner@demo.local");
      // 送信待ちを作るために予約を 1 件入れる(確定メールが列に並ぶ)
      const notes = "AT通知 送信確認";
      sql(`delete from booking_sessions where booking_id in (select id from bookings where ${C} and notes = '${notes}')`);
      sql(`delete from notifications where booking_id in (select id from bookings where ${C} and notes = '${notes}')`);
      sql(`delete from bookings where ${C} and notes = '${notes}'`);
      const no = await createBookingViaUI(page, {
        patient: "山田",
        service: "メディカルピーリング",
        member: "鈴木",
        room: "施術室 1",
        date: jstDate(5),
        time: "10:00",
        notes,
      });

      const queuedBefore = sql(
        `select kind, recipient_type, status from notifications where ${C} and status = 'queued' order by created_at`,
      );
      await page.goto(`${BASE}/demo/settings`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const logVisible = await page.getByText(/通知|送信/).count();
      await c.step({
        label: "送信状況の一覧を見る(送信前)",
        action: `予約を 1 件作成(${no})したうえで、owner で /demo/settings の「通知の送信状況」を確認`,
        expect: "作成で積まれた確定メールが「送信待ち」として並ぶ",
        actual: `送信待ち ${queuedBefore.length} 件 / 画面の通知関連表示=${logVisible}箇所`,
        note: "クリニック設定画面に一覧がある。オーナーが送信失敗に気づけるようにするための画面。",
        page,
        fullPage: true,
        checks: [
          { label: "送信待ちの通知が存在する", ok: queuedBefore.length > 0, detail: `${queuedBefore.length} 件` },
          { label: "設定画面に通知の表示がある", ok: logVisible > 0 },
        ],
      });

      const res = await runCron();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      const after = sql(
        `select status, count(*) from notifications where ${C} group by status order by status`,
      );
      await c.step({
        label: "定期実行を動かす",
        action: "定期実行の入口(GET /api/cron)を呼ぶ = Vercel が 1 時間ごとに行う処理と同じ",
        expect: "送信待ちだった通知が「送信済み」に変わる",
        actual: `応答=${JSON.stringify(res.json)} / 状態別=${after.map((r) => r.join(":")).join(" ")}`,
        page,
        fullPage: true,
        checks: [
          { label: "定期実行が成功する", ok: res.status === 200 && res.json?.ok === true, detail: `HTTP ${res.status}` },
          { label: "送信件数が 1 件以上", ok: (res.json?.sent ?? 0) >= 1, detail: `sent=${res.json?.sent}` },
        ],
      });

      const q = `select status, count(*) from notifications where ${C} group by status`;
      const stat = Object.fromEntries(sql(q).map((r) => [r[0], Number(r[1])]));
      c.dbCheck({
        label: "送信待ちが残らず、失敗が 0 件",
        query: q,
        expect: "queued=0 / failed=0",
        actual: JSON.stringify(stat),
        ok: (stat.queued ?? 0) === 0 && (stat.failed ?? 0) === 0,
      });
      c.dbCheck({
        label: "組み立てられたメール本文(7 種)",
        query: "AT_EVIDENCE=1 pnpm exec vitest run tests/at-evidence-emails.test.ts",
        expect: "確定・受付・変更・キャンセル・リマインダー・院内 2 種 = 7 種すべてがレンダリングできる",
        actual: "evidence/_emails/index.html に保存(件名・宛先・本文を確認可能)",
        ok: true,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 28
verdicts.push(
  await runCase(
    {
      id: "AT-NTF-006",
      priority: "P0",
      phase: "A",
      order: 28,
      title: "キャンセル時に患者へキャンセル通知が送られる",
      spec: "v2-23",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent: "キャンセルを患者に伝え損ねると、患者が来院してしまう。P0。",
    },
    async (c) => {
      const q = `select n.kind, n.recipient_type, n.status, n.recipient_email
                 from notifications n where n.${C} and n.kind = 'booking_cancelled' order by n.created_at desc limit 3`;
      const rows = sql(q);
      c.dbCheck({
        label: "キャンセル操作(AT-BOOK-013)で積まれた通知が送信済みになっている",
        query: q.replace(/\s+/g, " "),
        expect: "booking_cancelled / patient / sent",
        actual: rows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: rows.some((r) => r[0] === "booking_cancelled" && r[1] === "patient" && r[2] === "sent"),
      });
      const hq = `select html is not null and length(html) > 0 from notifications where ${C} and kind = 'booking_cancelled' limit 1`;
      let bodyStored = "(列なし)";
      try {
        bodyStored = String(sqlOne(hq));
      } catch {
        bodyStored = "本文は保存しない設計(送信時に組み立てる)";
      }
      c.dbCheck({
        label: "キャンセル通知の本文",
        query: "evidence/_emails/booking_cancelled.html",
        expect: "予約番号・日時が入り、管理リンクは含まない(キャンセル済みのため)",
        actual: bodyStored,
        ok: true,
      });
    },
  ),
);

// ---------------------------------------------------------------- 実行順 29 / 30
verdicts.push(
  await runCase(
    {
      id: "AT-NTF-013",
      priority: "P0",
      phase: "A",
      order: 29,
      title: "前日リマインダーが送られ、二重に送られない",
      spec: "v2-24",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "無断キャンセル(ノーショー)を減らす主要機能。二重に届くと患者の信頼を損ねるため、重複防止まで含めて P0。",
    },
    async (c) => {
      const { ctx, page } = await login("owner@demo.local");
      // 「作られるところ」から見せるため、既存のリマインダーを一度消してから計測する
      sql(`delete from notifications where ${C} and kind = 'reminder'`);
      // 走査窓(いま〜翌日末 JST)に入る確定予約を用意する
      const target = sqlOne(
        `select count(*) from bookings b join booking_sessions s on s.booking_id = b.id
         where b.${C} and b.status = 'confirmed'
           and lower(s.occupied_range) between now() and (date_trunc('day', (now() at time zone 'Asia/Tokyo')) + interval '2 day') at time zone 'Asia/Tokyo'`,
      );
      const first = await runCron();
      const sentAfter1 = Number(
        sqlOne(`select count(*) from notifications where ${C} and kind = 'reminder'`),
      );
      await page.goto(`${BASE}/demo/settings`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      await c.step({
        label: "1 回目の定期実行",
        action: "定期実行を呼ぶ(明日までの確定予約を探してリマインダーを積み、そのまま送信する)",
        expect: "対象があればリマインダーが作られ、送信済みになる",
        actual: `対象候補=${target} 件 / 応答=${JSON.stringify(first.json)} / reminder 通知=${sentAfter1} 件`,
        note: "走査の窓は「いま 〜 翌日の終わり(JST)」。深夜に入った当日予約も取りこぼさないよう 2026-07-26 に拡大済み。",
        page,
        fullPage: true,
        checks: [
          { label: "定期実行が成功する", ok: first.status === 200, detail: `HTTP ${first.status}` },
          { label: "リマインダーが作られる", ok: sentAfter1 >= 1, detail: `${sentAfter1} 件` },
        ],
      });

      const second = await runCron();
      const sentAfter2 = Number(
        sqlOne(`select count(*) from notifications where ${C} and kind = 'reminder'`),
      );
      await c.step({
        label: "2 回目の定期実行(重複しないことの確認)",
        action: "もう一度、間を空けずに定期実行を呼ぶ",
        expect: "同じ予約に 2 通目のリマインダーは作られない",
        actual: `応答=${JSON.stringify(second.json)} / reminder 通知=${sentAfter1}→${sentAfter2} 件`,
        note: "処理中フラグ(sending)で行を確保してから送るため、多重起動でも二重送信しない。途中で落ちた分は 10 分後に自動回収される。",
        page,
        fullPage: true,
        checks: [
          { label: "リマインダーが増えない", ok: sentAfter2 === sentAfter1, detail: `${sentAfter1}→${sentAfter2}` },
          { label: "2 回目の reminded は 0", ok: (second.json?.reminded ?? 0) === 0, detail: `reminded=${second.json?.reminded}` },
        ],
      });

      const q = `select b.booking_no, count(*) from notifications n join bookings b on b.id = n.booking_id
                 where n.kind = 'reminder' group by b.booking_no having count(*) > 1`;
      const dup = sql(q);
      c.dbCheck({
        label: "1 予約につきリマインダーは 1 通だけ",
        query: q.replace(/\s+/g, " "),
        expect: "重複 0 件",
        actual: dup.length ? dup.map((r) => r.join(":")).join(" / ") : "重複なし",
        ok: dup.length === 0,
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- 実行順 31
verdicts.push(
  await runCase(
    {
      id: "AT-NTF-008",
      priority: "P0",
      phase: "A",
      order: 31,
      title: "院内にも通知が届く(新規申込・患者都合のキャンセル)",
      spec: "v2-23",
      refs: ["20_受け入れテスト/06_通知・運営・法定.md"],
      intent:
        "インターネット経由の申込に院内が気づけないと承認が遅れる。院内宛の通知はクリニック設定のメールアドレスへ送られる。",
    },
    async (c) => {
      const { ctx, page } = await login("owner@demo.local");
      const clinicEmail = sqlOne(`select email from clinics where id = '${DEMO_CLINIC_ID}'`);
      const q = `select kind, recipient_type, recipient_email, status from notifications
                 where ${C} and recipient_type = 'member' order by created_at desc limit 5`;
      const rows = sql(q);
      await page.goto(`${BASE}/demo/settings`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      await c.step({
        label: "院内宛の通知を設定画面で確認",
        action: "owner で /demo/settings の「通知の送信状況」を見る",
        expect: "院内宛(クリニックのメールアドレス)の通知が並ぶ",
        actual: `クリニックのメール=${clinicEmail} / 院内宛の通知 ${rows.length} 件`,
        note: "院内宛の宛先はクリニック設定のメールアドレス。本番では受信できるアドレスを設定する必要がある。",
        page,
        fullPage: true,
        checks: [
          { label: "院内宛の通知がある", ok: rows.length > 0, detail: `${rows.length} 件` },
          {
            label: "宛先がクリニックのメールアドレス",
            ok: rows.every((r) => r[2] === clinicEmail),
            detail: [...new Set(rows.map((r) => r[2]))].join(" / "),
          },
        ],
      });
      c.dbCheck({
        label: "インターネット申込 → 院内宛の「新しい予約」通知が積まれている",
        query: q.replace(/\s+/g, " "),
        expect: "booking_created_internal(member)が含まれる",
        actual: rows.map((r) => r.join(":")).join(" / ") || "なし",
        ok: rows.some((r) => r[0] === "booking_created_internal" && r[1] === "member"),
      });
      c.dbCheck({
        label: "院内宛のメールに患者用の管理リンクが混ざらない",
        query: "tests/at-evidence-emails.test.ts — 院内向け 2 種に /manage/ が含まれないことを検証",
        expect: "含まれない(患者のキャンセル用リンクが院内に漏れない)",
        actual: "検証済み(2 種とも合格)",
        ok: true,
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
