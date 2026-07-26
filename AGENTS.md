<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# premake 開発ルール

## 仕様の正

- 現行仕様: `docs/10_v2_仕様/`(要件 v2-01〜26、データモデル、画面、実装計画、デザインシステム)
- `docs/01〜03`(旧マッチングプラットフォーム仕様)と `docs/05` は**凍結済みの参照資産**。実装根拠にしない
- 実装ファイルには `@implements v2-XX` タグを付ける

## Next.js 16 の要点(訓練データとの差分)

- `middleware.ts` は廃止 → ルートの `proxy.ts`(関数名も `proxy`、nodejs ランタイム)
- `cookies()` / `headers()` / `params` / `searchParams` は **await 必須**(同期アクセスは削除済み)
- `PageProps<'/path'>` / `LayoutProps<'/path'>` 型ヘルパーがグローバルに生成される
- `revalidateTag(tag, profile)` は第 2 引数必須。Server Action での即時反映は `updateTag(tag)`、ルーターの再描画は `refresh()`
- Turbopack がデフォルト(`--turbopack` フラグ不要)

## セキュリティ境界(必読)

- RLS はデフォルト拒否・**anon ポリシーなし**。未ログイン導線(公開ページ・ゲスト予約・問診)は必ず Server Action / Route Handler + `createAdminClient()`(service role)+ アプリ層検証(トークン・zod・レート制限)で実装する
- 院内機能は `requireMember(clinicSlug, role?)` を Server Action / layout の入口で必ず呼ぶ
- 患者情報・問診の閲覧は `recordAudit()` で閲覧ログを残す
- `SUPABASE_SERVICE_ROLE_KEY` をクライアントコンポーネントに露出させない(`server-only` を守る)

## コーディング

- Biome(`pnpm lint`)。TypeScript strict、`any` 禁止
- UI は `src/components/ui/`(shadcn 再テーマ済み)を使う。Tailwind 標準色の直書き禁止 — `docs/10_v2_仕様/04_デザインシステム.md` のトークン(CSS 変数)を使う
- 日時は UTC 保存(tstzrange)・表示は Asia/Tokyo(date-fns-tz)。表示形式は `7/12(金) 13:00–15:30`
- **PostgREST の関係埋め込みには FK ヒント必須**: bookings/patients/services/booking_sessions 等はテナント整合用の複合 FK(20260722000005)で FK が 2 本あるため、`patient:patients!bookings_patient_id_fkey(...)` のように単一 FK を明示しないと PGRST201(曖昧)で失敗する
- コミットは User の明示指示があるときのみ
