# DB 設計 — premake / インデックス

> 全 88 機能（FR-01〜FR-88）に対応するデータモデル。Supabase (PostgreSQL 15+) を前提。RLS の SQL は `../03_権限設計.md` に集約。

---

## ファイル構成

| ファイル | 内容 |
|---|---|
| [00_index.md](00_index.md) | このファイル（索引） |
| [01_設計方針.md](01_設計方針.md) | 命名規則 / タイムゾーン / 暗号化 / マルチテナント / 拡張機能 / トリガー / ハッシュチェーン |
| [02_ER図.md](02_ER図.md) | ER 図（主要） + リレーション概要 |
| [03_tables_A_認証組織ユーザー.md](03_tables_A_認証組織ユーザー.md) | 法人・施設・ユーザー・プロフィール・招待・MFA・セッション・免許審査・規約同意 |
| [04_tables_B_スペース.md](04_tables_B_スペース.md) | スペース・画像・料金・空き枠ルール |
| [05_tables_C_予約顧客.md](05_tables_C_予約顧客.md) | 予約・予約セッション・変更申請・キャンセルポリシー上書き・看護師公開ページ・利用客予約 |
| [06_tables_D_指示書施術記録.md](06_tables_D_指示書施術記録.md) | 電子指示書・PDF・同意書・問診票・施術記録・追記・写真 |
| [07_tables_E_決済.md](07_tables_E_決済.md) | 決済・利用客事前決済・返金・手数料収益・Stripe Webhook / Connect |
| [08_tables_F_通知レビュー.md](08_tables_F_通知レビュー.md) | チャット・通知・通知設定・レビュー・レビュー通報 |
| [09_tables_G_運営監査.md](09_tables_G_運営監査.md) | 申請・違反案件・監査ログ・エクスポート・問合せ・お知らせ・規約版 |
| [10_tables_H_横断基盤.md](10_tables_H_横断基盤.md) | バックグラウンドジョブ・フィーチャーフラグ・ヘルスイベント |
| [11_マイグレーション.md](11_マイグレーション.md) | マイグレーション計画 + シードデータ |
| [12_運用設計.md](12_運用設計.md) | データ量見積もり / 暗号化対象 / Storage バケット / 越境チェック / FR カバレッジ |

---

## 主要 60 テーブル一覧（カテゴリ別）

### A. 認証・組織・ユーザー（[03](03_tables_A_認証組織ユーザー.md)）
TBL-organizations / TBL-facilities / TBL-users / TBL-doctor_profiles / TBL-nurse_profiles / TBL-doctor_facility_assignments / TBL-invitations / TBL-mfa_settings / TBL-mfa_backup_codes / TBL-user_sessions / TBL-nurse_license_applications / TBL-doctor_license_applications / TBL-facility_license_applications / TBL-organization_applications / TBL-user_term_consents

### B. スペース（[04](04_tables_B_スペース.md)）
TBL-spaces / TBL-space_images / TBL-space_pricing / TBL-space_availability_rules / TBL-space_availability_overrides

### C. 予約・顧客予約（[05](05_tables_C_予約顧客.md)）
TBL-bookings / TBL-booking_sessions / TBL-booking_change_requests / TBL-cancel_policy_overrides / TBL-nurse_pages / TBL-customer_bookings

### D. 指示書・施術記録（[06](06_tables_D_指示書施術記録.md)）
TBL-prescriptions / TBL-prescription_pdfs / TBL-consent_templates / TBL-customer_consents / TBL-questionnaire_templates / TBL-customer_questionnaire_responses / TBL-treatment_records / TBL-treatment_record_addenda / TBL-treatment_record_images

### E. 決済（[07](07_tables_E_決済.md)）
TBL-payments / TBL-customer_payments / TBL-refunds / TBL-platform_revenue / TBL-stripe_events / TBL-stripe_connect_accounts

### F. 通知・レビュー（[08](08_tables_F_通知レビュー.md)）
TBL-chat_threads / TBL-chat_messages / TBL-chat_message_attachments / TBL-notifications / TBL-notification_preferences / TBL-reviews / TBL-review_reports

### G. 運営・監査（[09](09_tables_G_運営監査.md)）
TBL-applications / TBL-violations / TBL-audit_log / TBL-export_logs / TBL-inquiries / TBL-announcements / TBL-term_versions

### H. 横断基盤（[10](10_tables_H_横断基盤.md)）
TBL-worker_jobs / TBL-feature_flags / TBL-system_health_events

---

## 機能 (FR) → テーブル 逆引き

| カテゴリ | 主要 FR | 主要テーブル |
|---|---|---|
| A 認証 | FR-01〜12, FR-81 | users, doctor_profiles, nurse_profiles, invitations, mfa_*, user_sessions, *_license_applications, user_term_consents |
| B 法人施設 | FR-13〜18, FR-82〜84 | organizations, facilities, doctor_facility_assignments, spaces, space_*, invitations |
| C 検索予約 | FR-19〜27, FR-88 | spaces (search_vector), bookings, booking_sessions, booking_change_requests, cancel_policy_overrides |
| D 指示書記録 | FR-28〜35 | prescriptions, prescription_pdfs, consent_templates, customer_consents, questionnaire_*, treatment_records, treatment_record_* |
| E 決済 | FR-36〜44, FR-86 | payments, customer_payments, refunds, platform_revenue, stripe_events, stripe_connect_accounts, cancel_policy_overrides |
| F メッセージ | FR-45〜48 | chat_threads, chat_messages, chat_message_attachments, notifications, notification_preferences |
| G レビュー | FR-49〜52 | reviews, review_reports |
| H 運営 | FR-53〜60, FR-87 | applications, violations, audit_log, export_logs, inquiries, announcements, term_versions, license_applications |
| I 公開 | FR-61〜64 | term_versions, inquiries |
| J ダッシュボード | FR-65〜68, FR-85 | platform_revenue + 各業務テーブル |
| K 顧客予約 | FR-69〜75 | nurse_pages, customer_bookings, customer_consents, customer_questionnaire_responses, customer_payments |
| 横断 | FR-76〜80 | audit_log, worker_jobs, feature_flags, system_health_events |

---

バージョン: 1.1 / 作成日: 2026-05-10 / Phase 2
