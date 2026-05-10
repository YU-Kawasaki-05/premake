# DB 設計 — B. スペース

> [00_index.md](00_index.md) に戻る

## TBL-spaces — スペース
**関連機能**: FR-14, FR-17

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| facility_id | UUID | NO | FK |
| name | VARCHAR(100) | NO | スペース名 |
| room_type | VARCHAR(20) | NO | 診察室/処置室/個室/病室/その他 |
| area_sqm | NUMERIC(5,2) | NO | 広さ |
| equipments | TEXT[] | NO | '{}' | 設備 |
| amenities_text | TEXT | YES | 備品 |
| usage_rules | TEXT | YES | 利用ルール |
| concurrent_capacity | SMALLINT | NO | 1 |
| earliest_entry_time | TIME | YES | 入室可能時刻 |
| latest_exit_time | TIME | YES | 退室期限 |
| description | TEXT | YES | |
| status | VARCHAR(20) | NO | 'draft' | draft / published / unpublished |
| search_vector | TSVECTOR | YES | 全文検索用 (Generated) |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |
| deleted_at | TIMESTAMPTZ | YES | |

**インデックス**:
- `INDEX (facility_id, status)`
- `INDEX USING GIN (search_vector)` — 検索 (FR-19)
- `INDEX USING GIN (equipments)` — 設備フィルタ

**制約**: `CHECK (status IN ('draft', 'published', 'unpublished'))`

**RLS**:
- 公開: `published` で誰でも SELECT 可（認証済みユーザーのみ）
- 編集: 自施設の管理者・配下法人管理者のみ

---

## TBL-space_images — スペース画像

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| space_id | UUID | NO | FK |
| url | VARCHAR(500) | NO | Storage URL |
| sort_order | SMALLINT | NO | 0 | 表示順 |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (space_id, sort_order)`

---

## TBL-space_pricing — 料金（バージョン管理込み）
**関連機能**: FR-15

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| space_id | UUID | NO | FK |
| base_price | INTEGER | NO | 基本料金（円/時間） |
| billing_unit | VARCHAR(10) | NO | 1h / 30m / 15m |
| min_duration_min | SMALLINT | NO | 最低利用時間 |
| time_window_multipliers | JSONB | YES | [{from, to, mul}] |
| weekday_multipliers | JSONB | YES | {"sat_sun_holiday": 1.3} |
| advance_discount_pct | SMALLINT | NO | 0 |
| consecutive_discount_pct | SMALLINT | NO | 0 |
| effective_from | TIMESTAMPTZ | NO | 適用開始 |
| effective_to | TIMESTAMPTZ | YES | NULL = 現行 |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (space_id, effective_from DESC)` — 既予約は当時の料金参照

> `space_pricing_history` は別テーブルではなく、`effective_from/to` で 1 テーブル管理（履歴アプローチ）。

---

## TBL-space_availability_rules — 営業時間（繰り返し）
**関連機能**: FR-16

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| space_id | UUID | NO | FK |
| weekdays | TEXT[] | NO | ['mon','tue','wed',...] |
| start_time | TIME | NO | 例: 09:00 |
| end_time | TIME | NO | 開始より後 |
| valid_from | DATE | YES | 有効開始日 |
| valid_to | DATE | YES | 有効終了日 |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (space_id)`

---

## TBL-space_availability_overrides — 個別ブロック / オープン
**関連機能**: FR-16

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| space_id | UUID | NO | FK |
| override_type | VARCHAR(10) | NO | 'block' / 'open' |
| start_at | TIMESTAMPTZ | NO | |
| end_at | TIMESTAMPTZ | NO | |
| reason | VARCHAR(200) | YES | メンテナンス等 |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (space_id, start_at, end_at)`

**制約**: `CHECK (start_at < end_at)`

---

[← 03_tables_A_認証組織ユーザー.md](03_tables_A_認証組織ユーザー.md) | [次: 05_tables_C_予約顧客.md →](05_tables_C_予約顧客.md)
