import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationKind } from "./templates";

/**
 * 通知をキューに積む(notifications テーブル status=queued)。
 * 実際の送信は Cron(/api/cron)がまとめて処理する。送信失敗が予約処理を止めないよう分離。
 */
export async function enqueueNotification(params: {
  clinicId: string;
  bookingId: string;
  recipientEmail: string | null;
  recipientType: "patient" | "member";
  kind: NotificationKind;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!params.recipientEmail) return; // 宛先が無ければ積まない
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      clinic_id: params.clinicId,
      booking_id: params.bookingId,
      recipient_type: params.recipientType,
      recipient_email: params.recipientEmail,
      kind: params.kind,
      payload: (params.payload ?? {}) as never,
      status: "queued",
    });
  } catch (e) {
    console.error("[notifications] enqueue failed", params.kind, e);
  }
}
