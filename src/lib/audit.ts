import "server-only";

import { headers } from "next/headers";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";

type AuditEntry = {
  clinicId?: string;
  actorUserId?: string;
  actorType: "member" | "ops" | "guest" | "system";
  action: string; // 例: "booking.create" / "questionnaire.view"
  targetType?: string;
  targetId?: string;
  diff?: Record<string, unknown>;
};

/**
 * 監査 + 利用計測イベントの記録(@implements v2-04)。
 * 記録失敗で業務処理を止めない(検証計測を兼ねるため継続を優先)。
 */
export async function recordAudit(entry: AuditEntry) {
  try {
    const admin = createAdminClient();
    const h = await headers();
    const { error } = await admin.from("audit_logs").insert({
      clinic_id: entry.clinicId ?? null,
      actor_user_id: entry.actorUserId ?? null,
      actor_type: entry.actorType,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      diff: (entry.diff ?? null) as never,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: h.get("user-agent") ?? null,
    });
    // supabase-js は失敗を throw せず戻り値で返す。捨てると #13 のように無音で欠落する。
    // details/hint は行の内容(diff に患者情報が入りうる)を含むことがあるため message/code のみ
    if (error) throw new Error(`audit insert failed: ${error.code} ${error.message}`);
  } catch (error) {
    // 監査の欠落を無音にしない(#13 の教訓)。業務処理を止めない方針は維持する
    console.error("[audit] failed to record", entry.action, error);
    await reportError(error, { audit_action: entry.action, target_type: entry.targetType });
  }
}
