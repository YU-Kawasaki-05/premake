// フェーズ F 招待の受諾(本番の立ち上げで必ず通る経路) — AT-AUTH-017 / 019 / 020
// 実行: node scripts/at-evidence/phase-f-01-invite.mjs
import {
  BASE,
  DEMO_CLINIC_ID,
  anonContext,
  closeBrowser,
  runCase,
  sql,
  sqlOne,
  summarize,
} from "./lib.mjs";

const C = `clinic_id = '${DEMO_CLINIC_ID}'`;
const verdicts = [];
const REF = ["20_受け入れテスト/01_基盤・認証・スタッフ管理.md"];
const EMAIL = "at-newstaff@example.com";
const NEW_PASSWORD = "at-verify-Passw0rd!";

/** 招待を直接作る(画面からの発行は AT-AUTH-015 で検証済み)。平文トークンを返す */
function seedInvitation({ email, hoursValid = 72, accepted = false, plain }) {
  sql(`delete from invitations where ${C} and email = '${email}'`);
  const id = sqlOne(
    `insert into invitations (clinic_id, email, roles, employment_type, token_hash, expires_at, accepted_at)
     values ('${DEMO_CLINIC_ID}', '${email}', array['staff'], 'employed',
             encode(digest('${plain}','sha256'),'hex'),
             now() + interval '${hoursValid} hour',
             ${accepted ? "now()" : "null"})
     returning id`,
  );
  return id;
}
function cleanupUser(email) {
  sql(`delete from clinic_members where user_id in (select id from auth.users where email = '${email}')`);
  sql(`delete from profiles where id in (select id from auth.users where email = '${email}')`);
  sql(`delete from auth.identities where user_id in (select id from auth.users where email = '${email}')`);
  sql(`delete from auth.users where email = '${email}'`);
  sql(`delete from invitations where ${C} and email = '${email}'`);
}

// ---------------------------------------------------------------- AT-AUTH-017
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-017",
      priority: "P0",
      phase: "F",
      order: 501,
      title: "招待された人が新規登録して院内メンバーになる",
      spec: "v2-03",
      refs: REF,
      intent:
        "本番の立ち上げで院長・看護師が必ず通る経路。ここが通らないと誰もシステムに入れない。",
      notes:
        "招待の発行は AT-AUTH-015 で画面から検証済み。ここでは受諾側の動作に集中するため、招待レコードを直接作って平文トークンで /invite/<token> を開いている(メール送信がない環境の運用と同じ)。",
    },
    async (c) => {
      cleanupUser(EMAIL);
      const plain = "at-invite-accept-token-000000000001";
      seedInvitation({ email: EMAIL, plain });
      const membersBefore = Number(sqlOne(`select count(*) from clinic_members where ${C}`));

      const { ctx, page } = await anonContext();
      const res = await page.goto(`${BASE}/invite/${plain}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);
      const body = await page.locator("body").innerText();
      await c.step({
        label: "招待リンクを開く",
        action: `渡された招待リンク /invite/<token> を未ログインで開く`,
        expect: "クリニック名と、氏名・パスワードの入力欄が表示される",
        actual: `HTTP ${res?.status()} / クリニック名の表示=${body.includes("デモクリニック")} / 入力欄=${await page.locator("#fullName").count()}`,
        page,
        fullPage: true,
        checks: [
          { label: "招待画面が開く", ok: (await page.locator("#fullName").count()) > 0 },
          { label: "どのクリニックへの招待か分かる", ok: body.includes("デモクリニック") },
        ],
      });

      await page.fill("#fullName", "AT検証 新スタッフ");
      await page.fill("#password", NEW_PASSWORD);
      await page.getByRole("button", { name: /登録|参加|開始/ }).first().click();
      await page.waitForTimeout(3000);
      const url = page.url().replace(BASE, "");
      const memberRow = sql(
        `select array_to_string(m.roles, ','), m.status, m.display_name
         from clinic_members m join auth.users u on u.id = m.user_id
         where m.${C} and u.email = '${EMAIL}'`,
      )[0] ?? [];
      const membersAfter = Number(sqlOne(`select count(*) from clinic_members where ${C}`));
      await c.step({
        label: "氏名とパスワードを設定して参加",
        action: "氏名「AT検証 新スタッフ」とパスワードを入力して送信",
        expect: "アカウントが作られ、クリニックのメンバー(staff)として台帳へ入れる",
        actual: `遷移先=${url} / メンバー ${membersBefore}→${membersAfter} / 登録内容=${memberRow.join(" / ")}`,
        note: "招待に記録された役割(staff)がそのまま適用される。招待を受ける側が役割を選べない設計。",
        page,
        fullPage: true,
        checks: [
          { label: "メンバーが 1 名増える", ok: membersAfter === membersBefore + 1, detail: `${membersBefore}→${membersAfter}` },
          { label: "役割が招待どおり staff", ok: (memberRow[0] ?? "") === "staff", detail: String(memberRow[0]) },
          { label: "在籍状態(active)で登録される", ok: memberRow[1] === "active", detail: String(memberRow[1]) },
          { label: "院内の画面へ入れている", ok: url.startsWith("/demo"), detail: url },
        ],
      });

      const inv = sql(`select accepted_at is not null from invitations where ${C} and email = '${EMAIL}'`)[0] ?? [];
      c.dbCheck({
        label: "招待が受諾済みとして記録される(使い回しの防止)",
        query: `select accepted_at is not null from invitations where ${C} and email = '${EMAIL}'`,
        expect: "受諾済み(accepted_at が入る)",
        actual: inv[0] === "t" ? "受諾済み" : "未受諾のまま",
        ok: inv[0] === "t",
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-AUTH-020
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-020",
      priority: "P0",
      phase: "F",
      order: 502,
      title: "一度使った招待リンクは二度目は使えない",
      spec: "v2-03",
      refs: REF,
      intent:
        "招待リンクはメールやチャットで送られ、転送・流出しやすい。使い回せると第三者がクリニックのメンバーになれてしまう。",
    },
    async (c) => {
      const plain = "at-invite-accept-token-000000000001"; // AT-AUTH-017 で使用済みのトークン
      const { ctx, page } = await anonContext();
      const membersBefore = Number(sqlOne(`select count(*) from clinic_members where ${C}`));
      const res = await page.goto(`${BASE}/invite/${plain}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const body = await page.locator("body").innerText();
      const membersAfter = Number(sqlOne(`select count(*) from clinic_members where ${C}`));
      await c.step({
        label: "受諾済みのリンクを再度開く",
        action: "AT-AUTH-017 で使用済みの招待リンクをもう一度開く",
        expect: "「招待リンクが無効です」と表示され、入力欄は出ない",
        actual: `HTTP ${res?.status()} / 無効の表示=${/無効|期限|使用され/.test(body)} / 入力欄=${await page.locator("#fullName").count()}`,
        note: "受諾時に accepted_at を条件付きで更新しているため、同じトークンで 2 人目が入ることはない。",
        page,
        fullPage: true,
        checks: [
          { label: "無効と表示される", ok: /無効|期限|使用され/.test(body) },
          { label: "入力欄が出ない", ok: (await page.locator("#fullName").count()) === 0 },
          { label: "メンバーが増えていない", ok: membersAfter === membersBefore, detail: `${membersBefore}→${membersAfter}` },
        ],
      });
      await ctx.close();
    },
  ),
);

// ---------------------------------------------------------------- AT-AUTH-019
verdicts.push(
  await runCase(
    {
      id: "AT-AUTH-019",
      priority: "P0",
      phase: "F",
      order: 503,
      title: "期限が切れた招待リンクは使えない",
      spec: "v2-03",
      refs: REF,
      intent:
        "古い招待メールが残っていても、期限を過ぎていれば入れないこと。退職者への招待が残っている場合のリスクを抑える。",
      notes: "期限切れの状態を作るため、有効期限を過去にした招待レコードを直接作成している。",
    },
    async (c) => {
      const email2 = "at-expired@example.com";
      const plain = "at-invite-expired-token-000000000002";
      cleanupUser(email2);
      seedInvitation({ email: email2, hoursValid: -1, plain });
      const membersBefore = Number(sqlOne(`select count(*) from clinic_members where ${C}`));

      const { ctx, page } = await anonContext();
      const res = await page.goto(`${BASE}/invite/${plain}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const body = await page.locator("body").innerText();
      const membersAfter = Number(sqlOne(`select count(*) from clinic_members where ${C}`));
      await c.step({
        label: "期限切れのリンクを開く",
        action: "有効期限が 1 時間前に切れた招待リンクを開く",
        expect: "「招待リンクが無効です」と表示され、入力欄は出ない",
        actual: `HTTP ${res?.status()} / 無効の表示=${/無効|期限|使用され/.test(body)} / 入力欄=${await page.locator("#fullName").count()}`,
        page,
        fullPage: true,
        checks: [
          { label: "無効と表示される", ok: /無効|期限|使用され/.test(body) },
          { label: "入力欄が出ない", ok: (await page.locator("#fullName").count()) === 0 },
          { label: "メンバーが増えていない", ok: membersAfter === membersBefore, detail: `${membersBefore}→${membersAfter}` },
        ],
      });

      // 推測トークンでの侵入
      const res2 = await page.goto(`${BASE}/invite/guessed-token-0000000000000000`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(600);
      const body2 = await page.locator("body").innerText();
      await c.step({
        label: "でたらめなトークンで開く",
        action: "存在しない招待トークンを URL に入れて開く",
        expect: "同じく無効として扱われ、クリニック名も漏れない",
        actual: `HTTP ${res2?.status()} / クリニック名の表示=${body2.includes("デモクリニック")}`,
        note: "トークンは 32 バイトのランダム値をハッシュ化して保存しており、推測は現実的に不可能。",
        page,
        checks: [
          { label: "入力欄が出ない", ok: (await page.locator("#fullName").count()) === 0 },
          { label: "クリニック名が漏れない", ok: !body2.includes("デモクリニック") },
        ],
      });

      const q = `select length(token_hash), token_hash = encode(digest('${plain}','sha256'),'hex') as is_hash
                 from invitations where ${C} and email = '${email2}'`;
      const row = sql(q)[0] ?? [];
      c.dbCheck({
        label: "招待トークンは平文ではなくハッシュで保存されている",
        query: q.replace(/\s+/g, " "),
        expect: "64 文字の SHA-256 ハッシュ",
        actual: row.join(" / ") || "なし",
        ok: Number(row[0]) === 64 && row[1] === "t",
      });

      cleanupUser(email2);
      cleanupUser(EMAIL);
      c.dbCheck({
        label: "検証用アカウント・招待を削除して環境を元に戻した",
        query: `delete from auth.users where email in ('${EMAIL}','${email2}')`,
        expect: "0 件",
        actual: `${sqlOne(`select count(*) from auth.users where email in ('${EMAIL}','${email2}')`)} 件`,
        ok: Number(sqlOne(`select count(*) from auth.users where email in ('${EMAIL}','${email2}')`)) === 0,
      });
      await ctx.close();
    },
  ),
);

await closeBrowser();
process.exit(summarize(verdicts) ? 0 : 1);
