// results/*.json から証跡 HTML(納品物)を生成する。
// 実行: node scripts/at-evidence/build-report.mjs
// 出力: docs/21_手動受入テスト_2026-07-27/index.html
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const OUT_DIR = `${REPO}docs/21_手動受入テスト_2026-07-27`;
const RESULTS_DIR = `${OUT_DIR}/results`;

const PHASES = [
  {
    key: "A",
    title: "フェーズ A — 中核フロー(院内予約 → 確認 → 施術 → キャンセル/変更)",
    lede: "クリニックが毎日必ず通る一本道。ここが 1 つでも落ちたら業務が回らないため、最優先で検証しています。",
  },
  {
    key: "B",
    title: "フェーズ B — 公開予約(患者がインターネットから予約する導線)",
    lede: "公開予約を ON で運用する方針のため、患者が実際に触る画面を検証しています。",
  },
  {
    key: "C",
    title: "フェーズ C — 立ち上げ導線(本番で担当者が実際に行う初期設定)",
    lede: "クリニック作成・スタッフ招待・メニューや枠の登録。本番移行手順書の作業がそのまま動くかの確認です。",
  },
  {
    key: "D",
    title: "フェーズ D — 通知・運営・法定ページ",
    lede: "メールが正しく組み立てられるか、送信状況が見えるか、法定ページが表示されるか。",
  },
];

// 計画 §3 の「この環境では検証できない項目と代替」— 報告書にも必ず載せる
const LIMITS = [
  {
    item: "メールの到達性・迷惑メール判定・差出人ドメイン",
    why: "この環境には送信キー(RESEND_API_KEY)を設定していないため、メールは実際には送信されません。SPF/DKIM は本番ドメインの設定に依存します。",
    alt: "通知が「送信待ち → 送信済み」に変わることを DB で確認し、メール本文を実際に組み立てて保存しました。差出人の表示名・リンク先・文面はその保存物で確認できます。",
    rest: "実際に受信箱へ届くか、迷惑メールに入らないか。Resend を設定したステージングでの実送信が必要です。",
  },
  {
    item: "同時に 2 人が同じ枠を取った場合の二重予約",
    why: "人の手でブラウザを 2 つ操作しても「完全に同時」は作れません。",
    alt: "サーバーへ同時に予約要求を発射して実測しました。あわせて DB 制約テスト(56 チェック)の結果を引用しています。",
    rest: "高負荷が続いた状態での挙動。",
  },
  {
    item: "連続投稿の制限(レート制限)",
    why: "機能そのものが未実装です(環境の問題ではありません)。",
    alt: "連投しても拒否されないことを実測し、未実装であることを証跡として残しました。想定リスクと推奨対応を「検出した問題」に記載しています。",
    rest: "実装されるまで検証対象がありません。",
  },
  {
    item: "表示速度(p95・LCP)の基準達成",
    why: "開発サーバーは本番ビルドと性能特性が異なるため、基準の合否判定に使えません。",
    alt: "本番ビルドで参考値を計測して掲載しました(合否判定には使いません)。",
    rest: "本番インフラ上での実測。",
  },
  {
    item: "法定ページの法的妥当性",
    why: "弁護士の判断が必要な領域で、機械では代替できません。",
    alt: "現状の文言を全文キャプチャし、提供主体の明示・自由診療の注記・症例写真がないことを機械的に確認しました。弁護士に渡せる論点整理を添えています。",
    rest: "法的妥当性の判断そのもの。",
  },
  {
    item: "本番の Supabase / Vercel / 定期実行",
    why: "本番環境が未構築です。作成にはアカウントと課金の判断が必要です。",
    alt: "ローカルで同じ処理(定期実行 API・マイグレーション・初期データ)が動くことを確認し、本番移行手順書のどの STEP が残っているかを対応づけました。",
    rest: "本番環境そのもの。",
  },
];

const VERDICT_LABEL = { PASS: "合格", PARTIAL: "一部制限あり", NA: "検証不能", FAIL: "不合格" };

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function imgPath(caseId, file) {
  return `evidence/${encodeURIComponent(caseId)}/${encodeURIComponent(file)}`;
}

// ---- 読み込み ----
if (!existsSync(RESULTS_DIR)) {
  console.error(`results がありません: ${RESULTS_DIR}`);
  process.exit(1);
}
const cases = readdirSync(RESULTS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`${RESULTS_DIR}/${f}`, "utf8")))
  .sort((a, b) => (a.phase ?? "").localeCompare(b.phase ?? "") || (a.order ?? 0) - (b.order ?? 0));

const count = (v, list = cases) => list.filter((c) => c.verdict === v).length;
const allIssues = cases.flatMap((c) => (c.issues ?? []).map((i) => ({ ...i, caseId: c.id, caseTitle: c.title })));
const generatedAt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date());

// ---- パーツ ----
function verdictChip(v) {
  return `<span class="vd vd-${v.toLowerCase()}">${VERDICT_LABEL[v] ?? v}</span>`;
}

/** 上部の遷移帯: サムネイル → サムネイル → … */
function flowStrip(c) {
  const shots = c.steps.filter((s) => s.evidence.length > 0);
  if (shots.length === 0) return "";
  const items = shots
    .map((s) => {
      const src = imgPath(c.id, s.evidence[0]);
      return `<figure class="flow-item ${s.ok ? "" : "flow-ng"}">
        <button type="button" class="shot" data-src="${src}" data-cap="${esc(`${c.id} ステップ${s.n}: ${s.label}`)}">
          <img src="${src}" alt="${esc(s.label)}" loading="lazy">
        </button>
        <figcaption><span class="fnum">${s.n}</span>${esc(s.label)}</figcaption>
      </figure>`;
    })
    .join('<div class="flow-arrow" aria-hidden="true">→</div>');
  return `<div class="flow" role="group" aria-label="画面の移り変わり">${items}</div>`;
}

function stepBlock(c, s) {
  const checks = (s.checks ?? [])
    .map(
      (k) =>
        `<li class="${k.ok ? "ck-ok" : "ck-ng"}"><span class="ck-mark">${k.ok ? "✓" : "✗"}</span><span>${esc(k.label)}${k.detail ? `<span class="ck-detail">${esc(k.detail)}</span>` : ""}</span></li>`,
    )
    .join("");
  const shots = s.evidence
    .map(
      (f) =>
        `<button type="button" class="shot shot-lg" data-src="${imgPath(c.id, f)}" data-cap="${esc(`${c.id} ステップ${s.n}: ${s.label}`)}"><img src="${imgPath(c.id, f)}" alt="${esc(s.label)}" loading="lazy"></button>`,
    )
    .join("");
  return `<div class="step ${s.ok ? "" : "step-ng"}">
    <div class="step-head"><span class="step-n">${s.n}</span><h4>${esc(s.label)}</h4>${s.ok ? "" : '<span class="vd vd-fail">この手順で不一致</span>'}</div>
    <div class="step-body">
      <div class="step-text">
        <dl>
          <dt>操作</dt><dd>${esc(s.action)}</dd>
          <dt>期待</dt><dd>${esc(s.expect)}</dd>
          <dt>実測</dt><dd>${esc(s.actual)}</dd>
        </dl>
        ${checks ? `<ul class="checks">${checks}</ul>` : ""}
        ${s.note ? `<p class="why"><b>判定の根拠</b> ${esc(s.note)}</p>` : ""}
      </div>
      ${shots ? `<div class="step-shot">${shots}</div>` : ""}
    </div>
  </div>`;
}

function dbTable(c) {
  if (!c.dbChecks?.length) return "";
  const rows = c.dbChecks
    .map(
      (d) => `<tr class="${d.ok ? "" : "row-ng"}">
        <td>${d.ok ? "✓" : "✗"}</td>
        <td>${esc(d.label)}</td>
        <td><code>${esc(d.query)}</code></td>
        <td>${esc(d.expect)}</td>
        <td>${esc(d.actual)}</td>
      </tr>`,
    )
    .join("");
  return `<details class="dbwrap" open><summary>データベースでの裏取り(${c.dbChecks.length}件)</summary>
    <p class="sec-sub">画面表示だけでは「本当に保存されたか」が分かりません。実際に DB へ問い合わせた結果を載せています。</p>
    <div class="table-scroll"><table class="db">
      <thead><tr><th></th><th>確認したこと</th><th>実行したクエリ</th><th>期待</th><th>実測</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></details>`;
}

function issueBlock(i, caseId) {
  const fixed = i.status === "fixed";
  const shot = i.evidence
    ? `<button type="button" class="shot shot-lg" data-src="evidence/_issues/${encodeURIComponent(i.evidence)}" data-cap="${esc(`${caseId ?? ""} 問題の証跡: ${i.summary}`)}"><img src="evidence/_issues/${encodeURIComponent(i.evidence)}" alt="${esc(i.summary)}" loading="lazy"></button>`
    : "";
  return `<div class="callout ${fixed ? "warn" : "crit"}">
    <span class="lab">${fixed ? "検出 → この作業内で修正済み" : "未解決の問題"} ／ 深刻度 ${esc(i.severity)}${caseId ? ` ／ ${esc(caseId)}` : ""}</span>
    <p><b>${esc(i.summary)}</b></p>
    ${i.detail ? `<p>${esc(i.detail)}</p>` : ""}
    ${i.impact ? `<p><b>影響:</b> ${esc(i.impact)}</p>` : ""}
    ${i.fix ? `<p><b>修正内容:</b> ${esc(i.fix)}</p>` : ""}
    ${i.workaround ? `<p><b>回避策:</b> ${esc(i.workaround)}</p>` : ""}
    ${shot ? `<div class="issue-shot"><p class="issue-shot-cap">発見時の画面(修正前)</p>${shot}</div>` : ""}
  </div>`;
}

function caseBlock(c) {
  const issues = (c.issues ?? []).map((i) => issueBlock(i, null)).join("");
  const reason = c.naReason
    ? `<div class="callout info"><span class="lab">この環境では検証できません</span><p>${esc(c.naReason)}</p></div>`
    : c.partialReason
      ? `<div class="callout warn"><span class="lab">一部に制限があります</span><p>${esc(c.partialReason)}</p></div>`
      : "";
  const abort = c.aborted
    ? `<div class="callout crit"><span class="lab">途中で中断</span><p>例外が発生し、以降の手順は実行されていません。</p><pre>${esc(c.abortError)}</pre></div>`
    : "";
  return `<article class="case" id="${esc(c.id)}">
    <header class="case-head">
      <div class="case-id"><code>${esc(c.id)}</code><span class="pri pri-${esc((c.priority ?? "").toLowerCase())}">${esc(c.priority)}</span>${verdictChip(c.verdict)}</div>
      <h3>${esc(c.title)}</h3>
      ${c.intent ? `<p class="case-intent">${esc(c.intent)}</p>` : ""}
      ${c.spec ? `<p class="case-meta">対象要件 <code>${esc(c.spec)}</code>${(c.refs ?? []).length ? ` ／ 詳細手順 ${c.refs.map((r) => `<code>docs/${esc(r)}</code>`).join(" ")}` : ""}</p>` : ""}
    </header>
    ${reason}${abort}
    ${flowStrip(c)}
    <div class="steps">${c.steps.map((s) => stepBlock(c, s)).join("")}</div>
    ${dbTable(c)}
    ${issues}
  </article>`;
}

// ---- 組み立て ----
const summaryRows = PHASES.map((p) => {
  const list = cases.filter((c) => c.phase === p.key);
  if (list.length === 0) return "";
  return `<tr><td>${esc(p.key)}</td><td>${esc(p.title.replace(/^フェーズ [A-D] — /, ""))}</td>
    <td>${list.length}</td><td class="num-ok">${count("PASS", list)}</td><td class="num-warn">${count("PARTIAL", list)}</td>
    <td class="num-na">${count("NA", list)}</td><td class="num-ng">${count("FAIL", list)}</td></tr>`;
}).join("");

const phaseSections = PHASES.map((p) => {
  const list = cases.filter((c) => c.phase === p.key);
  if (list.length === 0) return "";
  return `<section id="phase-${p.key}">
    <h2>${esc(p.title)}</h2>
    <p class="sec-sub">${esc(p.lede)}</p>
    ${list.map(caseBlock).join("")}
  </section>`;
}).join("");

const openIssues = allIssues.filter((i) => i.status !== "fixed");
const fixedIssues = allIssues.filter((i) => i.status === "fixed");
const issuesSection = allIssues.length
  ? `<section id="issues"><h2>検出した問題</h2>
     <p class="sec-sub">見つかったものは隠さず全部載せています。この作業内で直したものは「修正済み」、判断や別作業が必要なものは「未解決」に分けています。</p>
     <div class="chips" style="margin-bottom:18px">
       <span class="chip big ${openIssues.length ? "ng" : "ok"}">未解決 ${openIssues.length}</span>
       <span class="chip big warn">修正済み ${fixedIssues.length}</span>
     </div>
     ${openIssues.length ? `<h3>未解決(判断・追加作業が必要)</h3>${openIssues.map((i) => issueBlock(i, i.caseId)).join("")}` : ""}
     ${fixedIssues.length ? `<h3>この作業内で修正したもの</h3>${fixedIssues.map((i) => issueBlock(i, i.caseId)).join("")}` : ""}</section>`
  : `<section id="issues"><h2>検出した問題</h2><div class="callout ok"><span class="lab">現時点</span><p>実施済みの範囲で、実装側の問題は検出されていません。</p></div></section>`;

const limitsSection = `<section id="limits"><h2>この環境では確認できないこと(と、代わりに行ったこと)</h2>
  <p class="sec-sub">「できない」で終わらせず、代替手段でどこまで確認したか・何が残るかを明示します。ここに挙げた項目は本番設定後に改めて確認が必要です。</p>
  ${LIMITS.map(
    (l) => `<div class="limit">
    <h3>${esc(l.item)}</h3>
    <dl>
      <dt>なぜ確認できないか</dt><dd>${esc(l.why)}</dd>
      <dt>代わりに行ったこと</dt><dd>${esc(l.alt)}</dd>
      <dt>残る未検証範囲</dt><dd class="rest">${esc(l.rest)}</dd>
    </dl></div>`,
  ).join("")}</section>`;

const html = `<title>premake 受け入れテスト 画面証跡</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{
  --paper:#fbfaf8; --surface:#fff; --surface-2:#f4f2ee;
  --ink:#1b201e; --ink-soft:#4c534f; --ink-faint:#8a8f8b;
  --primary:#1d5c4d; --primary-strong:#164539; --primary-soft:#e9f2ee;
  --bronze:#8a6d43; --line:#e5e3de; --line-soft:#efedE8;
  --ok:#1d5c4d; --ok-bg:#e7f2ec; --warn:#8a5a00; --warn-bg:#fbf0d6;
  --crit:#a5342a; --crit-bg:#fae9e6; --info:#1e5a8a; --info-bg:#e7f0f8;
  --sans:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",system-ui,sans-serif;
  --serif:"Hiragino Mincho ProN","Yu Mincho",serif;
  --mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  --shadow:0 1px 2px rgba(28,25,23,.06),0 1px 1px rgba(28,25,23,.04);
}
@media (prefers-color-scheme:dark){:root{
  --paper:#14120f; --surface:#1c1917; --surface-2:#211e1a;
  --ink:#f5f3ef; --ink-soft:#b3ada5; --ink-faint:#78716c;
  --primary:#5aa48c; --primary-strong:#7bbda8; --primary-soft:#1a2e28;
  --bronze:#c0a06d; --line:#2c2925; --line-soft:#241f1b;
  --ok:#5aa48c; --ok-bg:#17271f; --warn:#d9a441; --warn-bg:#2c2411;
  --crit:#e08477; --crit-bg:#2e1b17; --info:#7fb4dc; --info-bg:#152532;
  --shadow:0 1px 2px rgba(0,0,0,.4);
}}
:root[data-theme="dark"]{
  --paper:#14120f; --surface:#1c1917; --surface-2:#211e1a;
  --ink:#f5f3ef; --ink-soft:#b3ada5; --ink-faint:#78716c;
  --primary:#5aa48c; --primary-strong:#7bbda8; --primary-soft:#1a2e28;
  --bronze:#c0a06d; --line:#2c2925; --line-soft:#241f1b;
  --ok:#5aa48c; --ok-bg:#17271f; --warn:#d9a441; --warn-bg:#2c2411;
  --crit:#e08477; --crit-bg:#2e1b17; --info:#7fb4dc; --info-bg:#152532;
  --shadow:0 1px 2px rgba(0,0,0,.4);
}
:root[data-theme="light"]{
  --paper:#fbfaf8; --surface:#fff; --surface-2:#f4f2ee;
  --ink:#1b201e; --ink-soft:#4c534f; --ink-faint:#8a8f8b;
  --primary:#1d5c4d; --primary-strong:#164539; --primary-soft:#e9f2ee;
  --line:#e5e3de; --line-soft:#efedE8; --ok:#1d5c4d; --ok-bg:#e7f2ec;
  --warn:#8a5a00; --warn-bg:#fbf0d6; --crit:#a5342a; --crit-bg:#fae9e6;
  --info:#1e5a8a; --info-bg:#e7f0f8;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.8;font-size:16px;-webkit-font-smoothing:antialiased}
.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
header.top{position:sticky;top:0;z-index:20;background:var(--primary-strong);color:#fff}
header.top .bar{display:flex;align-items:center;justify-content:space-between;min-height:52px;gap:12px;flex-wrap:wrap}
header.top .brand{font-weight:700;display:flex;align-items:center;gap:9px;font-size:15px}
header.top .brand .dot{width:10px;height:10px;border-radius:50%;background:#7bbda8}
header.top nav{display:flex;gap:14px;flex-wrap:wrap}
header.top a{color:#eaf2ef;text-decoration:none;font-size:13.5px}
header.top a:hover{text-decoration:underline}
.toggle{appearance:none;border:1px solid rgba(255,255,255,.35);background:transparent;color:#eaf2ef;border-radius:8px;height:30px;padding:0 10px;font:inherit;font-size:12.5px;cursor:pointer}
.hero{padding:46px 0 30px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--bronze);font-weight:700;margin:0 0 12px}
h1{font-family:var(--serif);font-weight:600;font-size:clamp(25px,4.5vw,36px);line-height:1.3;margin:0 0 14px}
.lede{font-size:17px;color:var(--ink-soft);max-width:66ch;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:22px}
.chip{font-size:12.5px;padding:5px 12px;border-radius:999px;background:var(--surface-2);color:var(--ink-soft);border:1px solid var(--line)}
.chip.big{font-size:14px;font-weight:600}
.chip.ok{background:var(--ok-bg);color:var(--ok);border-color:transparent}
.chip.ng{background:var(--crit-bg);color:var(--crit);border-color:transparent}
.chip.warn{background:var(--warn-bg);color:var(--warn);border-color:transparent}
section{padding:38px 0;border-bottom:1px solid var(--line-soft)}
h2{font-family:var(--serif);font-weight:600;font-size:23px;margin:0 0 6px}
h3{font-size:16.5px;font-weight:600;margin:26px 0 8px}
h4{font-size:15px;font-weight:600;margin:0}
p{margin:0 0 14px}
.sec-sub{color:var(--ink-soft);font-size:14.5px;margin:0 0 22px}
a{color:var(--primary)}
code{font-family:var(--mono);font-size:.86em;background:var(--surface-2);padding:1px 5px;border-radius:4px;border:1px solid var(--line);word-break:break-all}
pre{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.6}
.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:10px;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px;background:var(--surface)}
th,td{text-align:left;padding:9px 13px;border-bottom:1px solid var(--line-soft);vertical-align:top}
th{background:var(--surface-2);font-size:12px;letter-spacing:.04em;color:var(--ink-soft);font-weight:600}
tr:last-child td{border-bottom:none}
.num-ok{color:var(--ok);font-weight:700}.num-ng{color:var(--crit);font-weight:700}
.num-warn{color:var(--warn);font-weight:700}.num-na{color:var(--ink-faint);font-weight:700}
.row-ng{background:var(--crit-bg)}
.callout{border-radius:10px;padding:13px 15px;margin:16px 0;font-size:14.5px;border:1px solid}
.callout .lab{font-weight:700;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;display:block;margin-bottom:5px}
.callout p:last-child{margin-bottom:0}
.callout.warn{background:var(--warn-bg);border-color:color-mix(in srgb,var(--warn) 30%,transparent);color:var(--warn)}
.callout.crit{background:var(--crit-bg);border-color:color-mix(in srgb,var(--crit) 30%,transparent);color:var(--crit)}
.callout.info{background:var(--info-bg);border-color:color-mix(in srgb,var(--info) 30%,transparent);color:var(--info)}
.callout.ok{background:var(--ok-bg);border-color:color-mix(in srgb,var(--ok) 30%,transparent);color:var(--ok)}
.callout b,.callout code{color:inherit}
/* ケース */
.case{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px;margin:22px 0;box-shadow:var(--shadow)}
.case-head{border-bottom:1px solid var(--line-soft);padding-bottom:14px;margin-bottom:16px}
.case-id{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}
.case-head h3{margin:0 0 6px;font-family:var(--serif);font-size:19px}
.case-intent{font-size:14.5px;color:var(--ink-soft);margin:0 0 6px}
.case-meta{font-size:12.5px;color:var(--ink-faint);margin:0}
.pri{font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;letter-spacing:.04em}
.pri-p0{background:var(--crit-bg);color:var(--crit)}
.pri-p1{background:var(--warn-bg);color:var(--warn)}
.pri-p2{background:var(--surface-2);color:var(--ink-soft)}
.vd{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px}
.vd-pass{background:var(--ok-bg);color:var(--ok)}
.vd-fail{background:var(--crit-bg);color:var(--crit)}
.vd-partial{background:var(--warn-bg);color:var(--warn)}
.vd-na{background:var(--surface-2);color:var(--ink-faint)}
/* 遷移帯 */
.flow{display:flex;align-items:flex-start;gap:6px;overflow-x:auto;padding:14px;background:var(--surface-2);border-radius:12px;margin-bottom:18px}
.flow-item{margin:0;flex:0 0 190px;text-align:center}
.flow-item figcaption{font-size:12px;color:var(--ink-soft);margin-top:6px;line-height:1.5;display:flex;align-items:baseline;gap:5px;justify-content:center;text-align:left}
.fnum{flex:none;width:17px;height:17px;border-radius:50%;background:var(--primary);color:#fff;font-size:10.5px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--mono)}
.flow-arrow{flex:none;align-self:center;color:var(--primary);font-size:20px;padding:0 2px;margin-top:-18px}
.flow-ng .shot img{border-color:var(--crit)}
.shot{display:block;padding:0;border:none;background:none;cursor:zoom-in;width:100%}
.shot img{width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff;display:block}
.shot:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
/* ステップ */
.step{border-left:3px solid var(--primary-soft);padding:2px 0 2px 16px;margin:18px 0}
.step-ng{border-left-color:var(--crit)}
.step-head{display:flex;align-items:center;gap:9px;margin-bottom:8px;flex-wrap:wrap}
.step-n{flex:none;width:23px;height:23px;border-radius:50%;background:var(--primary);color:#fff;font-family:var(--mono);font-size:12px;display:inline-flex;align-items:center;justify-content:center}
.step-body{display:grid;grid-template-columns:1fr 300px;gap:18px;align-items:start}
@media (max-width:820px){.step-body{grid-template-columns:1fr}}
.step-text dl{margin:0;display:grid;grid-template-columns:60px 1fr;gap:4px 12px;font-size:14px}
.step-text dt{color:var(--ink-faint);font-size:12.5px;padding-top:2px}
.step-text dd{margin:0}
.checks{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:13.5px}
.checks li{display:flex;gap:7px;align-items:baseline}
.ck-mark{flex:none;font-weight:700}
.ck-ok .ck-mark{color:var(--ok)}
.ck-ng{color:var(--crit)}
.ck-detail{display:block;color:var(--ink-faint);font-family:var(--mono);font-size:11.5px;margin-top:1px}
.why{font-size:13.5px;color:var(--ink-soft);background:var(--surface-2);border-radius:8px;padding:8px 12px;margin:12px 0 0}
.why b{color:var(--ink)}
.shot-lg img{border-radius:8px}
.dbwrap{margin-top:20px;border-top:1px solid var(--line-soft);padding-top:12px}
.dbwrap summary{cursor:pointer;font-weight:600;font-size:14.5px}
.db code{font-size:11.5px;white-space:pre-wrap}
.issue-shot{margin-top:12px;max-width:520px}
.issue-shot-cap{font-size:12px;color:inherit;opacity:.85;margin:0 0 6px}
.limit{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:14px 0}
.limit h3{margin:0 0 10px;font-size:16px}
.limit dl{margin:0;display:grid;grid-template-columns:150px 1fr;gap:6px 14px;font-size:14px}
@media (max-width:700px){.limit dl{grid-template-columns:1fr}.limit dt{color:var(--bronze);font-weight:600}}
.limit dt{color:var(--ink-faint);font-size:12.5px}
.limit dd{margin:0}
.limit .rest{color:var(--warn)}
.read dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:14.5px}
.read dt{white-space:nowrap}
footer{padding:36px 0 70px;color:var(--ink-faint);font-size:13px}
/* モーダル */
dialog#lb{border:none;padding:0;background:transparent;max-width:96vw;max-height:96vh}
dialog#lb::backdrop{background:rgba(0,0,0,.78)}
dialog#lb img{max-width:96vw;max-height:86vh;display:block;border-radius:10px;background:#fff}
dialog#lb figcaption{color:#fff;font-size:13px;padding:10px 4px;text-align:center}
@media print{header.top{position:static}.shot{cursor:default}.flow{overflow:visible;flex-wrap:wrap}}
</style>

<header class="top"><div class="wrap bar">
  <span class="brand"><span class="dot"></span>premake 受け入れテスト 画面証跡</span>
  <nav>
    <a href="#summary">サマリ</a><a href="#read">読み方</a>
    ${PHASES.filter((p) => cases.some((c) => c.phase === p.key))
      .map((p) => `<a href="#phase-${p.key}">フェーズ${p.key}</a>`)
      .join("")}
    <a href="#issues">問題</a><a href="#limits">未検証</a>
  </nav>
  <button class="toggle" id="tg" type="button">◐ テーマ</button>
</div></header>

<div class="wrap">
<div class="hero">
  <p class="eyebrow">Acceptance Test Evidence</p>
  <h1>本番投入前の受け入れテスト — 画面証跡つき報告書</h1>
  <p class="lede">クリニックで実際に使う操作を、ブラウザを動かして 1 手順ずつ確認した記録です。各手順のスクリーンショットを画面が移り変わる順に並べ、<b>何を期待し、何が起き、なぜ合格と判断したか</b>を併記しています。画面だけでは分からない「本当にデータが保存されたか」はデータベースへ直接問い合わせて裏を取っています。</p>
  <div class="chips">
    <span class="chip big">ケース ${cases.length}</span>
    <span class="chip big ok">合格 ${count("PASS")}</span>
    ${count("PARTIAL") ? `<span class="chip big warn">一部制限 ${count("PARTIAL")}</span>` : ""}
    ${count("NA") ? `<span class="chip big">検証不能 ${count("NA")}</span>` : ""}
    ${count("FAIL") ? `<span class="chip big ng">不合格 ${count("FAIL")}</span>` : '<span class="chip big ok">不合格 0</span>'}
    <span class="chip">生成 ${esc(generatedAt)}</span>
  </div>
</div>

<section id="read" class="read">
  <h2>この文書の読み方</h2>
  <p class="sec-sub">はじめて読む方向けに、出てくる言葉と記号の意味をまとめます。</p>
  <dl>
    <dt><code>AT-XXX-000</code></dt><dd>テストケースの番号。詳しい手順は <code>docs/20_受け入れテスト/</code> の同じ番号の項に書かれています。</dd>
    <dt><span class="pri pri-p0">P0</span></dt><dd><b>リリースの門番</b>。1 件でも落ちたら本番に出せないと自分たちで決めた重要度です。<span class="pri pri-p1">P1</span> は重要だが運用で回避できるもの。</dd>
    <dt>${verdictChip("PASS")}</dt><dd>期待した通りに動いた。すべての確認項目が一致。</dd>
    <dt>${verdictChip("PARTIAL")}</dt><dd>主要な部分は動いたが、未実装の枝葉があるなど一部に制限がある。</dd>
    <dt>${verdictChip("NA")}</dt><dd>この環境では確認できない(理由はケース内に明記)。</dd>
    <dt>${verdictChip("FAIL")}</dt><dd>期待と違う結果。原因と影響をケース内に書いています。</dd>
    <dt>画面の帯</dt><dd>各ケースの上部にある、矢印でつながったスクリーンショットの列です。<b>左から右が実際の画面の移り変わり</b>。クリックすると拡大します。</dd>
    <dt>判定の根拠</dt><dd>「なぜ合格と判断したか」。見た目の印象ではなく、画面の文言・DB の行・監査ログのどれで確かめたかを書いています。</dd>
  </dl>
  <div class="callout info"><span class="lab">検証した環境</span>
    <p>開発用の環境(手元の PC 上のデータベース)です。本番の Supabase / Vercel ではありません。メールは実際には送信されず、内容がログに出る設定になっています。詳しくは「この環境では確認できないこと」を参照してください。</p></div>
</section>

<section id="summary">
  <h2>全体サマリ</h2>
  <p class="sec-sub">フェーズごとの合否。数字はケース数です。</p>
  <div class="table-scroll"><table>
    <thead><tr><th>フェーズ</th><th>範囲</th><th>ケース</th><th>合格</th><th>一部制限</th><th>検証不能</th><th>不合格</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table></div>
  <div class="callout ${count("FAIL") ? "crit" : "ok"}"><span class="lab">現時点の判定</span>
    <p>${count("FAIL") ? `不合格 ${count("FAIL")} 件があります。詳細は「検出した問題」を参照してください。` : "実施済みのケースはすべて合格しています。ただし本書は作成途中であり、未実施のフェーズが残っている場合は最終判定になりません(サマリのケース数を参照)。"}</p></div>
</section>

${phaseSections}
${issuesSection}
${limitsSection}

<footer>premake — クリニック予約・業務管理システム ／ 受け入れテスト画面証跡。生成: ${esc(generatedAt)}(自動生成。手書きの判定は含みません)</footer>
</div>

<dialog id="lb"><form method="dialog"><button type="submit" style="all:unset;cursor:zoom-out;display:block"><img id="lbimg" alt=""><figcaption id="lbcap"></figcaption></button></form></dialog>

<script>
(function(){
  var root=document.documentElement, btn=document.getElementById("tg");
  function cur(){return root.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}
  btn.addEventListener("click",function(){root.setAttribute("data-theme",cur()==="dark"?"light":"dark");});
  var lb=document.getElementById("lb"), img=document.getElementById("lbimg"), cap=document.getElementById("lbcap");
  document.addEventListener("click",function(e){
    var b=e.target.closest(".shot"); if(!b) return;
    img.src=b.dataset.src; img.alt=b.dataset.cap||""; cap.textContent=b.dataset.cap||"";
    lb.showModal();
  });
})();
</script>
`;

writeFileSync(`${OUT_DIR}/index.html`, html);
console.log(
  `index.html を生成: ケース ${cases.length}(PASS ${count("PASS")} / PARTIAL ${count("PARTIAL")} / NA ${count("NA")} / FAIL ${count("FAIL")})`,
);
