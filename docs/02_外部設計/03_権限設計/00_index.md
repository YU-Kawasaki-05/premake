# 権限設計 — premake / インデックス

> Supabase (PostgreSQL) RLS による多層防御。ロール定義 + 権限マトリクス + RLS SQL ポリシー + 認証フロー + セキュリティ考慮を集約。

---

## ファイル構成

| ファイル | 内容 |
|---|---|
| [00_index.md](00_index.md) | このファイル |
| [01_権限モデル.md](01_権限モデル.md) | RBAC + 属性 / テナント分離方針 / Service Role 取扱 |
| [02_ロール定義.md](02_ロール定義.md) | 7 ロール（U-01〜U-06 + ops + service）の権限境界 |
| [03_権限マトリクス_API.md](03_権限マトリクス_API.md) | EP-XXX × ロール 全エンドポイント認可マトリクス |
| [04_RLS_認証組織.md](04_RLS_認証組織.md) | A カテゴリテーブルの RLS SQL |
| [05_RLS_スペース予約.md](05_RLS_スペース予約.md) | B / C カテゴリテーブルの RLS SQL |
| [06_RLS_指示書記録決済.md](06_RLS_指示書記録決済.md) | D / E カテゴリテーブルの RLS SQL |
| [07_RLS_通知運営横断.md](07_RLS_通知運営横断.md) | F / G / H / 横断テーブルの RLS SQL |
| [08_認証フロー.md](08_認証フロー.md) | 認証・MFA・ゲスト・招待のシーケンス図 |
| [09_セキュリティ考慮.md](09_セキュリティ考慮.md) | CSRF / CORS / レート制限 / シークレット管理 / 監査 |

---

## 権限モデル サマリ

- **方式**: RBAC（ロールベース）+ テナント属性（facility_id / organization_id）
- **基盤**: Supabase Auth + Postgres RLS
- **JWT クレーム**: `app_metadata.role` / `app_metadata.facility_id` / `app_metadata.organization_id` / `app_metadata.license_status`
- **Service Role**: サーバー専用。Webhook / 運営越境 / バックグラウンドジョブのみ
- **Guest**: 利用客は Supabase users ではなく、署名付きトークン + SMS OTP

---

## ロール一覧

| ロール | DB 値 | テナント | 主な操作 |
|---|---|---|---|
| 看護師 | nurse | グローバル | 予約 / 施術記録投入 / 公開ページ |
| 施設管理者 | facility_admin | facility_id | 自施設管理 |
| 指示医 | doctor | facility_id | 指示書発行・記録確認 |
| 運営 | ops | グローバル | 全方位（aal2 / 監査必須） |
| 法人管理者 | org_admin | organization_id | 法人配下管理 |
| 利用客 | (guest) | - | 自分の予約のみ（OTP） |
| サービス | (service) | - | サーバー専用（Webhook / job） |

---

バージョン: 1.0 / 作成日: 2026-05-10 / Phase 2
