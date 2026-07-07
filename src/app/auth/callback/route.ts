import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * next が安全な相対パスか判定する。
 * - "/" 始まり(絶対 URL・スキーム相対 "//" を排除)
 * - 2文字目が "/" や "\" でない("/\evil" 等の回避を排除。new URL は "\"→"/" に正規化する)
 * - 制御文字・空白を含まない(タブ等での回避を排除)
 */
function isSafeRelativePath(value: string): boolean {
  if (!/^\/(?![/\\])/.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) <= 0x20 || value.charCodeAt(i) === 0x7f) return false;
  }
  return true;
}

// @implements v2-01 メールリンク(パスワードリセット等)の code → セッション交換
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/";
  const next = isSafeRelativePath(rawNext) ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login", url.origin));
}
