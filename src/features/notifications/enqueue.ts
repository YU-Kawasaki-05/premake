import "server-only";

// @implements v2-23 通知(患者/院内双方へ)

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

/**
 * 院内(スタッフ)向け通知の宛先メールを解決する。
 * 第一候補: clinics.email。無ければ active な owner の auth ユーザーのメールにフォールバック。
 * どちらも解決できなければ null(呼び出し側は enqueue しない)。
 */
export async function resolveClinicInternalEmail(clinicId: string): Promise<string | null> {
  // 通知の宛先解決失敗が予約処理を止めないよう、例外はここで握り潰す
  try {
    const admin = createAdminClient();

    const { data: clinic } = await admin
      .from("clinics")
      .select("email")
      .eq("id", clinicId)
      .maybeSingle();
    if (clinic?.email) return clinic.email;

    const { data: owners } = await admin
      .from("clinic_members")
      .select("user_id")
      .eq("clinic_id", clinicId)
      .eq("status", "active")
      .contains("roles", ["owner"]);

    for (const owner of owners ?? []) {
      const { data, error } = await admin.auth.admin.getUserById(owner.user_id);
      if (!error && data.user?.email) return data.user.email;
    }

    console.error(`[notifications] no internal email resolved for clinic ${clinicId}`);
    return null;
  } catch (e) {
    console.error("[notifications] resolveClinicInternalEmail failed", e);
    return null;
  }
}
