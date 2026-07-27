// 受け入れテストの証跡づくり: メール 7 種の本文を実際にレンダリングして HTML として保存する。
// ローカルでは実送信されないため、「送るべきものが正しく組み立てられているか」を目で見て確認できる
// 代替検証(docs/21_手動受入テスト_2026-07-27/00_実施計画.md §3)。
//
// 実行: AT_EVIDENCE=1 pnpm exec vitest run tests/at-evidence-emails.test.ts
// 通常の test / test:db では実行されない。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type NotificationKind,
  renderNotification,
} from "@/features/notifications/templates";

const RUN = process.env.AT_EVIDENCE === "1";
const OUT = path.resolve(process.cwd(), "docs/21_手動受入テスト_2026-07-27/evidence/_emails");

const CLINIC = "デモクリニック";
const APP = "https://reserve.example-clinic.jp";
const ctx = {
  clinicName: CLINIC,
  patientName: "山田 花子",
  serviceName: "アートメイク 眉(2回目まで)",
  startISO: "2026-07-31T04:00:00.000Z", // JST 13:00
  endISO: "2026-07-31T06:30:00.000Z", // JST 15:30
  bookingNo: "B-260727-8A70",
  manageUrl: `${APP}/c/demo/manage/xxxxxxxxxxxxxxxx`,
  dashboardUrl: `${APP}/demo`,
  requiresApproval: true,
};

const KINDS: { kind: NotificationKind; who: string; when: string }[] = [
  { kind: "booking_confirmed", who: "患者", when: "予約が確定したとき(院内作成・承認どちらも)" },
  { kind: "booking_requested", who: "患者", when: "インターネットから申し込み、院内の承認待ちになったとき" },
  { kind: "booking_rescheduled", who: "患者", when: "日時・担当・部屋が変更されたとき" },
  { kind: "booking_cancelled", who: "患者", when: "予約がキャンセルされたとき" },
  { kind: "reminder", who: "患者", when: "来院日の前日(定期実行で送信)" },
  { kind: "booking_created_internal", who: "院内", when: "インターネットから新しい申込が入ったとき" },
  { kind: "booking_cancelled_internal", who: "院内", when: "患者が自分でキャンセルしたとき" },
];

describe.skipIf(!RUN)("メール本文の証跡生成", () => {
  it("7 種すべてがレンダリングでき、HTML として保存される", () => {
    mkdirSync(OUT, { recursive: true });
    const index: string[] = [];

    for (const { kind, who, when } of KINDS) {
      const r = renderNotification(kind, ctx);
      expect(r, `${kind} がレンダリングできない`).not.toBeNull();
      if (!r) continue;

      // 管理リンクは患者向けにのみ入る。院内向けに患者のトークンが混ざっていないこと(NT-NEW-3)
      if (who === "院内") {
        expect(r.html, `${kind} に患者の管理リンクが混入している`).not.toContain("/manage/");
      }
      writeFileSync(
        `${OUT}/${kind}.html`,
        `<!doctype html><meta charset="utf-8"><title>${kind}</title>\n<!-- 宛先: ${who} / 送信タイミング: ${when} / 件名: ${r.subject} -->\n${r.html}\n`,
      );
      index.push(
        `<tr><td><code>${kind}</code></td><td>${who}</td><td>${when}</td><td>${r.subject}</td><td><a href="${kind}.html">本文を見る</a></td></tr>`,
      );
    }

    writeFileSync(
      `${OUT}/index.html`,
      `<!doctype html><meta charset="utf-8"><title>メール本文の証跡</title>
<style>body{font-family:system-ui,sans-serif;margin:32px;line-height:1.8;color:#1b201e}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #e5e3de;padding:8px 12px;text-align:left}
th{background:#f4f2ee}code{font-family:ui-monospace,monospace;font-size:12.5px}</style>
<h1>メール本文の証跡(全 ${index.length} 種)</h1>
<p>この環境では実際のメール送信を行わないため、送信処理が組み立てる本文をそのまま書き出したものです。
差出人の表示名はクリニック名になります。到達性・迷惑メール判定は本番設定後の確認項目です。</p>
<table><thead><tr><th>種別</th><th>宛先</th><th>送信タイミング</th><th>件名</th><th>本文</th></tr></thead>
<tbody>${index.join("\n")}</tbody></table>`,
    );
    expect(index.length).toBe(KINDS.length);
  });

  it("リマインダーの件名・本文が日付を断定していない", () => {
    // 走査窓を「いま〜翌日末」に広げた結果、当日分にも届きうるため「明日」と書けない(2026-07-26 修正)
    const r = renderNotification("reminder", ctx);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.subject).not.toContain("明日");
    expect(r.html).not.toContain("明日");
    expect(r.html).not.toContain("前日");
  });
});
