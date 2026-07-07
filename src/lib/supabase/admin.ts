import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import type { Database } from "./database.types";

/**
 * service role クライアント(RLS バイパス)。
 * ゲスト予約・問診記入・公開ページ読み取り・ジョブ実行など、
 * 未ログイン導線はすべてこのクライアント + アプリ層の検証(トークン・入力・レート制限)で扱う。
 * 使用箇所は Server Action / Route Handler に限定すること。
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
