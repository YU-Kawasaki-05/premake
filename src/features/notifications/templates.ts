// @implements v2-23 通知(患者/院内双方へ)

import { formatTimeRange } from "@/lib/datetime";

export type NotificationKind =
  | "booking_confirmed"
  | "booking_requested"
  | "booking_rescheduled"
  | "booking_cancelled"
  | "reminder"
  | "booking_created_internal";

type Ctx = {
  clinicName: string;
  patientName: string;
  serviceName: string;
  startISO: string | null;
  endISO: string | null;
  bookingNo: string;
  manageUrl?: string;
  // 院内向け(booking_created_internal)のみ使用。患者用 manage トークンは絶対に入れない
  requiresApproval?: boolean;
  dashboardUrl?: string;
};

const wrap = (title: string, body: string, ctaUrl?: string, ctaLabel = "予約内容を確認する") => `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
  <h2 style="font-size:18px;font-weight:600">${title}</h2>
  <div style="font-size:14px;line-height:1.9">${body}</div>
  ${
    ctaUrl
      ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="display:inline-block;background:#1d5c4d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">${ctaLabel}</a></p>`
      : ""
  }
</div>`;

function when(ctx: Ctx): string {
  return ctx.startISO && ctx.endISO ? formatTimeRange(ctx.startISO, ctx.endISO) : "日時未定";
}

/** 通知種別 → 件名と本文 HTML。未知の kind は null(呼び出し側で隔離) */
export function renderNotification(
  kind: NotificationKind,
  ctx: Ctx,
): { subject: string; html: string } | null {
  switch (kind) {
    case "booking_confirmed":
      return {
        subject: `【${ctx.clinicName}】ご予約が確定しました`,
        html: wrap(
          "ご予約が確定しました",
          `${ctx.patientName} 様<br>ご予約ありがとうございます。以下の内容で確定しました。<br><br>
           メニュー: ${ctx.serviceName}<br>日時: ${when(ctx)}<br>予約番号: ${ctx.bookingNo}`,
          ctx.manageUrl,
        ),
      };
    case "booking_requested":
      return {
        subject: `【${ctx.clinicName}】ご予約を受け付けました(確認中)`,
        html: wrap(
          "ご予約を受け付けました",
          `${ctx.patientName} 様<br>以下のご予約を受け付けました。クリニックの確認後に確定します。<br><br>
           メニュー: ${ctx.serviceName}<br>日時: ${when(ctx)}<br>予約番号: ${ctx.bookingNo}`,
          ctx.manageUrl,
        ),
      };
    case "booking_rescheduled":
      return {
        subject: `【${ctx.clinicName}】ご予約内容が変更になりました`,
        html: wrap(
          "ご予約内容が変更になりました",
          `${ctx.patientName} 様<br>ご予約内容を変更しました。変更後の内容は以下の通りです。<br><br>
           メニュー: ${ctx.serviceName}<br>日時: ${when(ctx)}<br>予約番号: ${ctx.bookingNo}`,
          ctx.manageUrl,
        ),
      };
    case "booking_cancelled":
      return {
        subject: `【${ctx.clinicName}】ご予約をキャンセルしました`,
        html: wrap(
          "ご予約をキャンセルしました",
          `${ctx.patientName} 様<br>以下のご予約をキャンセルしました。<br><br>
           メニュー: ${ctx.serviceName}<br>日時: ${when(ctx)}<br>予約番号: ${ctx.bookingNo}`,
        ),
      };
    case "reminder":
      return {
        subject: `【${ctx.clinicName}】ご予約前日のお知らせ`,
        html: wrap(
          "ご予約日が近づいています",
          `${ctx.patientName} 様<br>明日のご予約のお知らせです。<br><br>
           メニュー: ${ctx.serviceName}<br>日時: ${when(ctx)}<br>予約番号: ${ctx.bookingNo}<br><br>
           ご都合が悪い場合は下記からご連絡ください。`,
          ctx.manageUrl,
        ),
      };
    case "booking_created_internal":
      // 院内(スタッフ)向け。患者向け文面(「〜様」)にはしない
      return {
        subject: "【予約システム】新しい予約が入りました(要確認)",
        html: wrap(
          "新しい予約が入りました",
          `Web から新しい予約が入りました。内容をご確認ください。<br><br>
           患者名: ${ctx.patientName}<br>メニュー: ${ctx.serviceName}<br>日時: ${when(ctx)}<br>予約番号: ${ctx.bookingNo}<br><br>
           <strong>${
             ctx.requiresApproval
               ? "この予約は承認待ちです。管理画面での承認操作が必要です。"
               : "この予約は自動確定済みです。内容をご確認ください。"
}</strong>`,
          ctx.dashboardUrl,
          "管理画面で確認する",
        ),
      };
    default:
      // 未知 kind は 1 件で cron 全体を止めないよう、例外を投げず null を返して隔離する
      console.error(`[notifications] unknown kind: ${kind satisfies never}`);
      return null;
  }
}
