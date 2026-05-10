# DB 設計 — C. 予約・顧客予約

> [00_index.md](00_index.md) に戻る

## TBL-bookings — 予約（看護師→施設）
**関連機能**: FR-21, FR-22, FR-23, FR-24, FR-27

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_number | VARCHAR(8) | NO | UNIQUE 表示用 |
| nurse_user_id | UUID | NO | FK → users |
| space_id | UUID | NO | FK |
| facility_id | UUID | NO | FK (denormalized for RLS perf) |
| status | VARCHAR(30) | NO | pending_approval / approved / rejected / cancelled / completed / needs_doctor_assignment / payment_failed |
| status_reason | TEXT | YES | 拒否・キャンセル理由 |
| menu_items | TEXT[] | NO | 想定施術メニュー |
| usage_purpose | TEXT | YES | 利用目的 |
| amount_estimate | INTEGER | NO | 申込時固定料金（円） |
| amount_final | INTEGER | YES | 確定料金 |
| platform_fee | INTEGER | YES | プラットフォーム手数料 |
| stripe_payment_intent_id | VARCHAR(100) | YES | |
| approved_at | TIMESTAMPTZ | YES | |
| approved_by_user_id | UUID | YES | |
| cancelled_at | TIMESTAMPTZ | YES | |
| cancelled_by_user_id | UUID | YES | |
| cancelled_by_role | VARCHAR(20) | YES | nurse/facility/ops |
| completed_at | TIMESTAMPTZ | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (booking_number)`
- `INDEX (nurse_user_id, status, created_at DESC)` — 看護師一覧
- `INDEX (facility_id, status, created_at DESC)` — 施設一覧
- `INDEX (status, created_at)` — 運営監視

**制約**:
- `CHECK (status IN ('pending_approval','approved','rejected','cancelled','completed','needs_doctor_assignment','payment_failed'))`

---

## TBL-booking_sessions — 予約セッション（カウンセリング+施術）
**関連機能**: FR-88

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_id | UUID | NO | FK |
| sequence_no | SMALLINT | NO | 1〜N |
| session_type | VARCHAR(20) | NO | consultation / treatment |
| start_at | TIMESTAMPTZ | NO | |
| end_at | TIMESTAMPTZ | NO | |
| status | VARCHAR(20) | NO | scheduled / in_progress / completed / skipped / cancelled |
| customer_booking_id | UUID | YES | FK → customer_bookings |
| menu_items | TEXT[] | YES | treatment 必須 |
| prescription_id | UUID | YES | FK → prescriptions (treatment 時必須) |
| treatment_record_id | UUID | YES | FK → treatment_records |
| notes | TEXT | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `INDEX (booking_id, sequence_no)`
- `INDEX (start_at) WHERE status='scheduled'` — リマインドジョブ

**制約**:
- `EXCLUDE USING gist (booking_id WITH =, tstzrange(start_at, end_at) WITH &&)` — 予約内セッション重複防止
- スペース横断の二重予約防止は別途チェック（同一スペースの全 booking_sessions に対して GiST 制約を貼る、または Server Action で先行チェック）

```sql
-- 同一スペース内のセッション重複防止（参考）
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE booking_sessions
  ADD COLUMN space_id UUID GENERATED ALWAYS AS (
    (SELECT space_id FROM bookings WHERE bookings.id = booking_sessions.booking_id)
  ) STORED;
ALTER TABLE booking_sessions
  ADD CONSTRAINT no_overlapping_space_sessions
  EXCLUDE USING gist (
    space_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('scheduled', 'in_progress'));
```

---

## TBL-booking_change_requests — 予約変更申請
**関連機能**: FR-23

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_id | UUID | NO | FK |
| requested_by_user_id | UUID | NO | FK |
| change_payload | JSONB | NO | 変更内容（sessions / メニュー / 用途） |
| status | VARCHAR(20) | NO | pending / approved / rejected |
| applied_at | TIMESTAMPTZ | YES | |
| rejected_reason | TEXT | YES | |
| reviewed_by_user_id | UUID | YES | |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (booking_id, status)`

---

## TBL-cancel_policy_overrides — 施設別キャンセルポリシー
**関連機能**: FR-86

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| owner_type | VARCHAR(20) | NO | 'facility' / 'organization' |
| owner_id | UUID | NO | facility_id or organization_id |
| policy | JSONB | NO | [{hours_before, refund_rate, applies_to}] |
| effective_from | DATE | NO | |
| created_by_user_id | UUID | NO | |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (owner_type, owner_id, effective_from)`
- `INDEX (owner_type, owner_id)`

---

## TBL-nurse_pages — 看護師の公開ブッキングページ
**関連機能**: FR-69

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| nurse_user_id | UUID | NO | FK, UNIQUE |
| handle | VARCHAR(30) | NO | UNIQUE (nurse_profiles と同期) |
| profile_image_url | VARCHAR(500) | YES | |
| bio | TEXT | YES | |
| menus | JSONB | NO | [{id, name, base_price, duration_min, description}] |
| consultation_setting | VARCHAR(10) | NO | required / optional / none |
| prepayment_setting | VARCHAR(10) | NO | required / optional / none |
| visibility | VARCHAR(10) | NO | public / private |
| custom_cancel_policy | TEXT | YES | |
| faq | JSONB | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (handle)`
- `INDEX (visibility)` — 公開ページのみ index 対象に

---

## TBL-customer_bookings — 利用客のゲスト予約
**関連機能**: FR-70, FR-74, FR-75

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_number | VARCHAR(8) | NO | UNIQUE 利用客に提示 |
| nurse_user_id | UUID | NO | FK |
| menu_id | UUID | NO | nurse_pages.menus 内 ID |
| start_at | TIMESTAMPTZ | NO | |
| end_at | TIMESTAMPTZ | NO | |
| status | VARCHAR(20) | NO | tentative / confirmed / cancelled / completed / payment_failed |
| customer_name | VARCHAR(100) | NO | 暗号化推奨 |
| customer_name_kana | VARCHAR(100) | NO | |
| customer_email | VARCHAR(255) | NO | |
| customer_phone | VARCHAR(20) | NO | |
| customer_birthday | DATE | NO | |
| customer_gender | VARCHAR(10) | YES | |
| guardian_name | VARCHAR(100) | YES | 18 歳未満時 |
| guardian_relationship | VARCHAR(50) | YES | |
| sms_verified_at | TIMESTAMPTZ | YES | |
| free_memo | TEXT | YES | |
| consent_status | VARCHAR(20) | NO | 'pending' | pending / signed |
| questionnaire_status | VARCHAR(20) | NO | 'pending' | pending / submitted |
| prepayment_status | VARCHAR(20) | NO | 'not_required' | not_required / pending / completed / failed |
| linked_booking_session_id | UUID | YES | FK → booking_sessions |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (booking_number)`
- `INDEX (customer_email, status)` — 予約照会 (FR-74)
- `INDEX (nurse_user_id, start_at)` — 看護師の K カテゴリ予約一覧

---

[← 04_tables_B_スペース.md](04_tables_B_スペース.md) | [次: 06_tables_D_指示書施術記録.md →](06_tables_D_指示書施術記録.md)
