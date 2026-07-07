import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Next.js 16: middleware → proxy(nodejs ランタイム)
// 役割は Supabase セッションのリフレッシュのみ。認可は各 layout / Server Action で行う。
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    // proxy は env.ts(@t3-oss)を通さず直接参照(起動順の都合)
    // biome-ignore lint/style/noNonNullAssertion: 起動時に必須の env
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: 起動時に必須の env
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() がトークンを検証し、必要ならリフレッシュして cookie を更新する
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // 静的アセット・画像最適化・favicon 以外すべて
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
