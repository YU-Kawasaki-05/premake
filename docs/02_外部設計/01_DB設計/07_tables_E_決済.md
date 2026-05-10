# DB 設計 — E. 決済

> [00_index.md](00_index.md) に戻る

## TBL-payments — スペース利用料決済
**関連機能**: FR-38

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_id | UUID | NO | FK, UNIQUE |
| nurse_user_id | UUID | NO | |
| facility_id | UUID | NO | |
| amount | INTEGER | NO | 円 |
| platform_fee | INTEGER | NO | |
| transfer_amount | INTEGER | NO | facility 受取額 |
| currency | VARCHAR(3) | NO | 'JPY' |
| stripe_payment_intent_id | VARCHAR(100) | NO | UNIQUE |
| stripe_transfer_id | VARCHAR(100) | YES | |
| status | VARCHAR(20) | NO | requires_payment_method / authorized / captured / failed / refunded / partially_refunded |
| authorized_at | TIMESTAMPTZ | YES | |
| captured_at | TIMESTAMPTZ | YES | |
| transferred_at | TIMESTAMPTZ | YES | |
| refunded_amount | INTEGER | NO | 0 |
| idempotency_key | VARCHAR(100) | NO | UNIQUE |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (booking_id)`
- `UNIQUE (stripe_payment_intent_id)`
- `UNIQUE (idempotency_key)`
- `INDEX (nurse_user_id, status)` — 看護師明細
- `INDEX (facility_id, status)` — 施設明細
- `INDEX (status, captured_at)` — 運営監視

---

## TBL-customer_payments — 利用客事前決済
**関連機能**: FR-39

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| customer_booking_id | UUID | NO | FK, UNIQUE |
| nurse_user_id | UUID | NO | 受取看護師 |
| amount | INTEGER | NO | |
| platform_fee | INTEGER | NO | |
| transfer_amount | INTEGER | NO | nurse の Connect 取り分 |
| stripe_payment_intent_id | VARCHAR(100) | NO | UNIQUE |
| stripe_transfer_id | VARCHAR(100) | YES | |
| status | VARCHAR(20) | NO | requires_payment_method / processing / succeeded / failed / refunded / partially_refunded |
| captured_at | TIMESTAMPTZ | YES | |
| refunded_amount | INTEGER | NO | 0 |
| idempotency_key | VARCHAR(100) | NO | UNIQUE |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

---

## TBL-refunds — 返金
**関連機能**: FR-40

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| payment_id | UUID | YES | FK → payments |
| customer_payment_id | UUID | YES | FK → customer_payments |
| amount | INTEGER | NO | |
| reason | TEXT | NO | |
| refund_actor | VARCHAR(20) | NO | 'system' / 'ops' |
| stripe_refund_id | VARCHAR(100) | NO | UNIQUE |
| status | VARCHAR(20) | NO | pending / succeeded / failed |
| created_by_user_id | UUID | YES | 運営手動時 |
| created_at | TIMESTAMPTZ | NO | |
| completed_at | TIMESTAMPTZ | YES | |

**制約**:
- `CHECK ((payment_id IS NOT NULL) <> (customer_payment_id IS NOT NULL))` — 排他

---

## TBL-platform_revenue — 月次集計
**関連機能**: FR-43, FR-68

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| period_month | DATE | NO | 月初日 |
| total_gmv | BIGINT | NO | |
| total_platform_fee | BIGINT | NO | |
| total_refunds | BIGINT | NO | |
| computed_at | TIMESTAMPTZ | NO | |

**制約**: `UNIQUE (period_month)`

---

## TBL-stripe_events — Webhook 冪等管理
**関連機能**: FR-42

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | VARCHAR(100) | NO | PK = Stripe event_id |
| type | VARCHAR(100) | NO | payment_intent.succeeded 等 |
| payload | JSONB | NO | event 全体 |
| processed_at | TIMESTAMPTZ | YES | |
| error | TEXT | YES | |
| retry_count | SMALLINT | NO | 0 |
| created_at | TIMESTAMPTZ | NO | now() |

**インデックス**:
- `INDEX (type, created_at)` — type ごとの監視
- `INDEX (processed_at) WHERE processed_at IS NULL` — 未処理キュー

---

## TBL-stripe_connect_accounts — Connect 状態
**関連機能**: FR-37

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | VARCHAR(100) | NO | PK = Stripe account ID |
| owner_type | VARCHAR(20) | NO | 'facility' / 'organization' / 'nurse' |
| owner_id | UUID | NO | |
| payouts_enabled | BOOLEAN | NO | |
| charges_enabled | BOOLEAN | NO | |
| requirements | JSONB | YES | Stripe からの不足項目 |
| last_synced_at | TIMESTAMPTZ | NO | |
| created_at | TIMESTAMPTZ | NO | |

**制約**: `UNIQUE (owner_type, owner_id)`

**インデックス**: `INDEX (payouts_enabled)` — 警告対象抽出

---

[← 06_tables_D_指示書施術記録.md](06_tables_D_指示書施術記録.md) | [次: 08_tables_F_通知レビュー.md →](08_tables_F_通知レビュー.md)
