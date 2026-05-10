# DB 設計 — G. 運営・監査

> [00_index.md](00_index.md) に戻る

## TBL-applications — 申請型サインアップの審査キュー
**関連機能**: FR-02, FR-54

| id, type ('facility'/'organization'), email, payload (JSONB), status ('pending_review'/'approved'/'rejected'), reviewed_by_user_id, reviewed_at, reject_reason, created_at |

**インデックス**: `INDEX (status, created_at)` — 運営審査キュー

---

## TBL-violations — 違反案件
**関連機能**: FR-56

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| target_type | VARCHAR(50) | NO | user / facility / booking / review |
| target_id | UUID | NO | |
| severity | VARCHAR(20) | NO | low / medium / high / critical |
| source | VARCHAR(20) | NO | alert / report / manual |
| description | TEXT | NO | |
| action | VARCHAR(20) | NO | warning / suspend / force_cancel / refund / no_action / pending |
| notification_method | VARCHAR(20) | YES | email / phone_call / letter |
| status | VARCHAR(20) | NO | open / investigating / resolved |
| second_approver_id | UUID | YES | 凍結等の二名承認 |
| created_by_user_id | UUID | NO | |
| resolved_by_user_id | UUID | YES | |
| resolved_at | TIMESTAMPTZ | YES | |
| notes | TEXT | YES | 調査メモ |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `INDEX (status, severity, created_at)` — 重大度順
- `INDEX (target_type, target_id)`

---

## TBL-audit_log — 監査ログ（追記専用 / 月次パーティション）
**関連機能**: FR-76

> **追記専用**。UPDATE / DELETE はトリガーで拒否。月次パーティション（FR-76 BR-03）。

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | BIGSERIAL | NO | PK（時系列順） |
| ts | TIMESTAMPTZ | NO | デフォルト now() |
| actor_type | VARCHAR(10) | NO | user/system/ops |
| actor_id | UUID | YES | |
| action | VARCHAR(50) | NO | login_success / record_view / etc |
| target_type | VARCHAR(50) | YES | |
| target_id | UUID | YES | |
| facility_id | UUID | YES | RLS 用 |
| organization_id | UUID | YES | |
| ip | INET | YES | |
| user_agent | TEXT | YES | |
| details | JSONB | YES | |
| prev_hash | BYTEA | YES | チェーン |
| hash | BYTEA | NO | sha256(prev_hash || row_data) |

**パーティション**: `PARTITION BY RANGE (ts)`、月次。
**インデックス**:
- `INDEX (actor_id, ts DESC)`
- `INDEX (target_type, target_id, ts DESC)`
- `INDEX (facility_id, ts DESC)`

```sql
-- 月次パーティション例
CREATE TABLE audit_log (...) PARTITION BY RANGE (ts);
CREATE TABLE audit_log_2026_06 PARTITION OF audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- 自動作成は pg_partman 推奨
```

---

## TBL-export_logs — エクスポート履歴
**関連機能**: FR-58

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| requested_by_user_id | UUID | NO | |
| target | VARCHAR(50) | NO | transactions / users / facilities / etc |
| filter | JSONB | YES | |
| include_pii | BOOLEAN | NO | false |
| approved_by_user_id | UUID | YES | PII 時は別運営の承認 |
| file_url | VARCHAR(500) | YES | Storage |
| file_size | INTEGER | YES | |
| status | VARCHAR(20) | NO | queued / processing / completed / failed |
| completed_at | TIMESTAMPTZ | YES | |
| expires_at | TIMESTAMPTZ | YES | URL 失効 (24h) |
| created_at | TIMESTAMPTZ | NO | |

---

## TBL-inquiries — お問い合わせ
**関連機能**: FR-64

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| name | VARCHAR(100) | NO | |
| email | VARCHAR(255) | NO | |
| category | VARCHAR(20) | NO | サービス / 決済 / 技術トラブル / 申請 / その他 |
| subject | VARCHAR(200) | NO | |
| body | TEXT | NO | |
| recaptcha_score | NUMERIC(3,2) | YES | |
| ip | INET | YES | |
| status | VARCHAR(20) | NO | new / in_progress / resolved / spam |
| assigned_to_user_id | UUID | YES | 運営 |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `INDEX (status, created_at)` — 未対応キュー
- `INDEX (assigned_to_user_id, status)`

---

## TBL-announcements — お知らせ
**関連機能**: FR-60

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| target_segment | VARCHAR(50) | NO | all / nurses / facilities / orgs / specific_users |
| target_user_ids | UUID[] | YES | specific_users 時 |
| channels | TEXT[] | NO | ['in_app','email'] |
| title | VARCHAR(200) | NO | |
| body | TEXT | NO | |
| scheduled_at | TIMESTAMPTZ | YES | NULL = 即時 |
| published_at | TIMESTAMPTZ | YES | |
| expires_at | TIMESTAMPTZ | YES | |
| created_by_user_id | UUID | NO | |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (scheduled_at) WHERE published_at IS NULL` — 配信ジョブ

---

## TBL-term_versions — 規約版
**関連機能**: FR-61, FR-62, FR-63

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| terms_type | VARCHAR(20) | NO | tos / privacy / commerce |
| version | VARCHAR(20) | NO | "v1.0" 等 |
| body_md | TEXT | NO | Markdown |
| effective_from | DATE | NO | |
| created_by_user_id | UUID | NO | |
| created_at | TIMESTAMPTZ | NO | |

**制約**: `UNIQUE (terms_type, version)`

---

[← 08_tables_F_通知レビュー.md](08_tables_F_通知レビュー.md) | [次: 10_tables_H_横断基盤.md →](10_tables_H_横断基盤.md)
