/**
 * renderNotification / escapeHtml の純関数テスト(NT-NEW-3 / AUTH-2 / No.22)。
 * DB 不要。ユーザー由来値の HTML エスケープと URL 検証を検証する。
 */
import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  type NotificationKind,
  renderNotification,
} from "@/features/notifications/templates";

const ALL_KINDS: NotificationKind[] = [
  "booking_confirmed",
  "booking_requested",
  "booking_rescheduled",
  "booking_cancelled",
  "booking_cancelled_internal",
  "reminder",
  "booking_created_internal",
];

const baseCtx = {
  clinicName: "デモクリニック",
  patientName: "山田 太郎",
  serviceName: "カット",
  startISO: "2099-03-01T01:00:00.000Z", // JST 10:00
  endISO: "2099-03-01T02:00:00.000Z", // JST 11:00
  bookingNo: "B-0001",
  manageUrl: "https://example.com/c/demo/manage/tok",
  dashboardUrl: "https://example.com/demo",
  requiresApproval: false,
};

describe("escapeHtml", () => {
  it("& < > \" ' の 5 文字を実体参照化する", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("正常な日本語は変化しない", () => {
    expect(escapeHtml("山田 太郎")).toBe("山田 太郎");
  });
});

describe("renderNotification: HTML エスケープ(NT-NEW-3 / AUTH-2)", () => {
  it("ゲスト名の <img onerror> がそのまま HTML に出力されない(実体参照化)", () => {
    const r = renderNotification("booking_confirmed", {
      ...baseCtx,
      patientName: '<img src=x onerror=alert(1)>',
    });
    expect(r).not.toBeNull();
    expect(r?.html).not.toContain("<img src=x");
    expect(r?.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("ゲスト名の <a href=...> リンク注入が実体参照化される", () => {
    const r = renderNotification("booking_created_internal", {
      ...baseCtx,
      patientName: '<a href="https://evil.example">click</a>',
    });
    expect(r).not.toBeNull();
    expect(r?.html).not.toContain('<a href="https://evil.example">');
    expect(r?.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  it("serviceName / bookingNo も実体参照化される", () => {
    const r = renderNotification("booking_cancelled", {
      ...baseCtx,
      serviceName: "<b>x</b>",
      bookingNo: "<script>1</script>",
    });
    expect(r?.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(r?.html).toContain("&lt;script&gt;1&lt;/script&gt;");
    expect(r?.html).not.toContain("<script>");
  });

  it("正常な日本語名はそのまま本文に出る(過剰エスケープしない)", () => {
    const r = renderNotification("booking_confirmed", { ...baseCtx, patientName: "田中 みお" });
    expect(r?.html).toContain("田中 みお 様");
  });
});

describe("renderNotification: URL 検証", () => {
  it("http(s) の manageUrl は CTA として埋め込まれる", () => {
    const r = renderNotification("booking_confirmed", {
      ...baseCtx,
      manageUrl: "https://example.com/c/demo/manage/tok",
    });
    expect(r?.html).toContain('href="https://example.com/c/demo/manage/tok"');
  });

  it("javascript: スキームの URL は CTA を出さない(注入防止)", () => {
    const r = renderNotification("booking_confirmed", {
      ...baseCtx,
      manageUrl: "javascript:alert(1)",
    });
    expect(r?.html).not.toContain("javascript:alert(1)");
    expect(r?.html).not.toContain("<a href");
  });

  it("manageUrl 未定義なら CTA を出さない", () => {
    const r = renderNotification("booking_cancelled", { ...baseCtx, manageUrl: undefined });
    expect(r?.html).not.toContain("<a href");
  });
});

describe("renderNotification: 全 kind が null にならない", () => {
  for (const kind of ALL_KINDS) {
    it(`${kind} は subject/html を返す`, () => {
      const r = renderNotification(kind, baseCtx);
      expect(r).not.toBeNull();
      expect(r?.subject.length).toBeGreaterThan(0);
      expect(r?.html.length).toBeGreaterThan(0);
    });
  }

  it("booking_cancelled_internal は院内文面(空き枠の案内)を含む", () => {
    const r = renderNotification("booking_cancelled_internal", baseCtx);
    expect(r?.html).toContain("枠が空きました");
    expect(r?.html).toContain("山田 太郎"); // 患者名
    expect(r?.html).not.toContain("様"); // 院内向けなので患者敬称は付けない
  });
});
