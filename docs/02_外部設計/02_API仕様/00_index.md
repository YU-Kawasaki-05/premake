# API 仕様 — premake / インデックス

> Next.js 15 (App Router) + Server Actions + Route Handlers (DEC-20)。
> 内部用途は Server Actions（型安全な mutation）、Webhook / 公開 / 利用客ゲスト系は Route Handler（HTTP REST）として実装する。
> 本ドキュメントは「論理エンドポイント」を REST 風に統一記述する。Server Action 実装の場合は、対応する `actions/{name}.ts` の関数として実装される。

---

## ファイル構成

| ファイル | 内容 |
|---|---|
| [00_index.md](00_index.md) | このファイル（索引） |
| [01_設計方針.md](01_設計方針.md) | アーキテクチャ・URL 構造・認証ヘッダ・レスポンス形式・エラー規約・レート制限 |
| [02_認証共通.md](02_認証共通.md) | JWT・Cookie・RLS との連携・セッション管理 |
| [03_endpoints_A_認証.md](03_endpoints_A_認証.md) | EP-A001〜 サインアップ/ログイン/MFA/免許申請/招待 |
| [04_endpoints_B_法人施設スペース.md](04_endpoints_B_法人施設スペース.md) | EP-B001〜 法人/施設/スペース/料金/空き枠/Connect |
| [05_endpoints_C_予約.md](05_endpoints_C_予約.md) | EP-C001〜 検索/申込/承認/変更/キャンセル/セッション |
| [06_endpoints_D_指示書記録.md](06_endpoints_D_指示書記録.md) | EP-D001〜 指示書/同意書/問診票/施術記録 |
| [07_endpoints_E_決済.md](07_endpoints_E_決済.md) | EP-E001〜 カード/Webhook/返金/明細/入金 |
| [08_endpoints_F_通知.md](08_endpoints_F_通知.md) | EP-F001〜 通知/チャット/通知設定 |
| [09_endpoints_G_レビュー.md](09_endpoints_G_レビュー.md) | EP-G001〜 投稿/通報/モデレーション |
| [10_endpoints_H_運営.md](10_endpoints_H_運営.md) | EP-H001〜 運営審査/凍結/監査/CSV/代理オンボーディング |
| [11_endpoints_I_公開.md](11_endpoints_I_公開.md) | EP-I001〜 規約/プライバシー/特商法/問い合わせ |
| [12_endpoints_J_ダッシュボード.md](12_endpoints_J_ダッシュボード.md) | EP-J001〜 各ロールのダッシュボード集約 |
| [13_endpoints_K_顧客予約.md](13_endpoints_K_顧客予約.md) | EP-K001〜 看護師公開ページ/ゲスト予約/SMS 認証/予約照会 |
| [14_endpoints_横断.md](14_endpoints_横断.md) | EP-X001〜 health/status/feature flags/jobs |
| [15_quickref_エンドポイント一覧.md](15_quickref_エンドポイント一覧.md) | 全エンドポイントのフラットリスト（FR・認証・実装方式付き） |

---

## カテゴリ別 概要

| カテゴリ | エンドポイント数（概算） | 主な実装方式 | 主要ファイル |
|---|---|---|---|
| A 認証 | ~25 | Server Action + 一部 Route Handler | [03](03_endpoints_A_認証.md) |
| B 法人施設スペース | ~25 | Server Action 主体 | [04](04_endpoints_B_法人施設スペース.md) |
| C 予約 | ~20 | Server Action 主体 | [05](05_endpoints_C_予約.md) |
| D 指示書記録 | ~20 | Server Action 主体（Guest 系は Route Handler） | [06](06_endpoints_D_指示書記録.md) |
| E 決済 | ~12 | Stripe Webhook は Route Handler | [07](07_endpoints_E_決済.md) |
| F 通知 | ~7 | Server Action | [08](08_endpoints_F_通知.md) |
| G レビュー | ~6 | Server Action | [09](09_endpoints_G_レビュー.md) |
| H 運営 | ~18 | Server Action（Admin 内） | [10](10_endpoints_H_運営.md) |
| I 公開 | ~4 | Route Handler / 静的 | [11](11_endpoints_I_公開.md) |
| J ダッシュボード | ~5 | Server Action（GET 集約） | [12](12_endpoints_J_ダッシュボード.md) |
| K 顧客予約 | ~10 | Route Handler（公開 / ゲスト） | [13](13_endpoints_K_顧客予約.md) |
| 横断 | ~5 | Route Handler | [14](14_endpoints_横断.md) |
| **合計** | **~150 エンドポイント** | | |

---

## 規約

### EP-ID 命名
- カテゴリ別に `EP-{カテゴリ}{番号}` 形式: `EP-A001`, `EP-B001`, ...
- カテゴリ: A/B/C/D/E/F/G/H/I/J/K/X（横断）

### URL 規約
- ベース: `/api` （Route Handler）
- 内部 Server Action は `actions/{domain}/{action}.ts`
- 公開ゲスト用: `/c/...` (customer)・`/n/{handle}/...` (nurse public page)

### ステータスコード
- `200 OK`: 成功
- `201 Created`: 作成成功
- `204 No Content`: 削除等で本文なし
- `400 Bad Request`: バリデーションエラー
- `401 Unauthorized`: 未認証
- `403 Forbidden`: 認証済だが権限なし
- `404 Not Found`: リソース不在
- `409 Conflict`: 重複・状態不整合
- `422 Unprocessable Entity`: ビジネスルール違反
- `429 Too Many Requests`: レート制限
- `500 Internal Server Error`: サーバーエラー

### 認証種別
| 種別 | 説明 | 実装 |
|---|---|---|
| 不要 | 公開エンドポイント | 認証チェックなし |
| guest | 利用客の予約照会等。トークン+OTP | 一時セッション |
| user | 認証ユーザー（U-01〜U-06） | Supabase Auth Cookie |
| ops | 運営のみ | + role=ops チェック |
| service | 内部のみ。外部呼び出し不可 | Server Action only / Webhook signature |

---

## FR → EP 逆引き

各 FR がどのエンドポイントで実装されるかは、各カテゴリファイルの末尾「FR-XX 対応表」を参照、または [15_quickref_エンドポイント一覧.md](15_quickref_エンドポイント一覧.md) を参照。

---

バージョン: 1.0 / 作成日: 2026-05-10 / Phase 2
