import { formatTimeRange } from "@/lib/datetime";

export type NotificationKind =
  | "booking_confirmed"
  | "booking_requested"
  | "booking_cancelled"
  | "reminder";

type Ctx = {
  clinicName: string;
  patientName: string;
  serviceName: string;
  startISO: string | null;
  endISO: string | null;
  bookingNo: string;
  manageUrl?: string;
};

const wrap = (title: string, body: string, manageUrl?: string) => `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
  <h2 style="font-size:18px;font-weight:600">${title}</h2>
  <div style="font-size:14px;line-height:1.9">${body}</div>
  ${
    manageUrl
      ? `<p style="margin-top:20px"><a href="${manageUrl}" style="display:inline-block;background:#1d5c4d;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">予約内容を確認する</a></p>`
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
    default:
      // 未知 kind は 1 件で cron 全体を止めないよう、例外を投げず null を返して隔離する
      console.error(`[notifications] unknown kind: ${kind satisfies never}`);
      return null;
  }
}
