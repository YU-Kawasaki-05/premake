# premake

クリニックの自由診療予約・業務管理システム(単院 MVP)。

- 仕様: [docs/10_v2_仕様/](docs/10_v2_仕様/00_要件定義.md)(現行の正)
- 経緯: [docs/06_単院MVP転換/](docs/06_単院MVP転換/00_index.md)
- 旧仕様(凍結・参照資産): docs/01〜03, 05

## スタック

Next.js 16 (App Router / Turbopack) · TypeScript · Supabase (Postgres + Auth) · Tailwind v4 + shadcn/ui · Biome · Vitest · Resend

## セットアップ

```bash
pnpm install
pnpm db:start            # Supabase ローカル(要 Docker)。出力のキーを .env.local へ
cp .env.example .env.local
pnpm db:reset            # マイグレーション + シード適用
pnpm db:types            # DB 型生成
pnpm dev
```

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` / `pnpm build` | 開発 / 本番ビルド |
| `pnpm lint` / `pnpm lint:fix` | Biome チェック / 自動修正 |
| `pnpm typecheck` | TypeScript チェック |
| `pnpm test` | Vitest |
| `pnpm db:reset` | ローカル DB を migrations + seed から再構築 |
| `pnpm db:types` | `src/lib/supabase/database.types.ts` を再生成 |

## 構成

```
src/
  app/            ルーティング(院内 = /[clinic]/…、公開 = /c/[slug]/…、ops = /ops/…)
  components/ui/  shadcn/ui(premake トークンに再テーマ済み)
  lib/
    supabase/     client / server / admin(service role)
    auth.ts       requireUser / requireMember / requireOps(三層防御の第2層)
    audit.ts      監査 + 利用計測
  env.ts          環境変数バリデーション
supabase/
  migrations/     スキーマ(RLS 込み)
proxy.ts          セッションリフレッシュ(Next 16: middleware の後継)
```
