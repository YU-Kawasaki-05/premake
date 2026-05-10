# DB 設計 — F. 通知・レビュー

> [00_index.md](00_index.md) に戻る

## TBL-chat_threads — チャットスレッド
**関連機能**: FR-45

| id, booking_id (FK, UNIQUE), nurse_user_id, facility_id, last_message_at, created_at |

**インデックス**:
- `UNIQUE (booking_id)`
- `INDEX (nurse_user_id, last_message_at DESC)`
- `INDEX (facility_id, last_message_at DESC)`

---

## TBL-chat_messages — チャットメッセージ
**関連機能**: FR-45

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| thread_id | UUID | NO | FK |
| sender_user_id | UUID | NO | FK |
| body | TEXT | NO | |
| attachments_meta | JSONB | YES | [{file_id, mime}] |
| read_by | JSONB | NO | '{}' | {user_id: read_at} |
| deleted_at | TIMESTAMPTZ | YES | ソフトデリート |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (thread_id, created_at)`

---

## TBL-chat_message_attachments

| id, message_id (FK), file_url, mime_type, size_bytes, created_at |

**インデックス**: `INDEX (message_id)`

---

## TBL-notifications — 通知履歴
**関連機能**: FR-46, FR-47

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| user_id | UUID | YES | FK（ゲストの場合 NULL） |
| customer_email | VARCHAR(255) | YES | ゲスト宛て |
| event_type | VARCHAR(50) | NO | booking_approved / prescription_request / 等 |
| channel | VARCHAR(10) | NO | email / sms / in_app |
| template_version | VARCHAR(20) | NO | |
| payload | JSONB | NO | 送信内容 |
| status | VARCHAR(20) | NO | queued / sent / delivered / failed / bounced |
| failed_reason | TEXT | YES | |
| sent_at | TIMESTAMPTZ | YES | |
| read_at | TIMESTAMPTZ | YES | |
| idempotency_key | VARCHAR(200) | NO | UNIQUE |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (idempotency_key)`
- `INDEX (user_id, read_at) WHERE read_at IS NULL` — 未読カウント
- `INDEX (status, created_at)` — 送信失敗監視

---

## TBL-notification_preferences — 通知設定
**関連機能**: FR-48

| user_id, event_type, channel, enabled BOOLEAN, updated_at |

**制約**: `PRIMARY KEY (user_id, event_type, channel)`

---

## TBL-reviews — レビュー
**関連機能**: FR-49, FR-50, FR-51

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_id | UUID | NO | FK |
| reviewer_user_id | UUID | NO | |
| target_type | VARCHAR(20) | NO | space / facility / nurse |
| target_id | UUID | NO | space_id or user_id |
| star_rating | SMALLINT | NO | 1〜5 |
| category_ratings | JSONB | YES | {clean: 5, ...} |
| comment | TEXT | YES | |
| visibility | VARCHAR(20) | NO | public / facility_only / platform_only / private |
| status | VARCHAR(20) | NO | active / hidden / removed |
| edit_until | TIMESTAMPTZ | NO | created_at + 7 days |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**制約**:
- `UNIQUE (booking_id, reviewer_user_id, target_type)` — 1 予約 1 レビュー
- `CHECK (star_rating BETWEEN 1 AND 5)`

**インデックス**:
- `INDEX (target_type, target_id, status, created_at DESC)` — 一覧表示
- `INDEX (reviewer_user_id, status)` — 投稿者の自分一覧

---

## TBL-review_reports — レビュー通報
**関連機能**: FR-52

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| review_id | UUID | NO | FK |
| reporter_user_id | UUID | NO | |
| reason | VARCHAR(50) | NO | 誹謗中傷 / 個人情報 / 虚偽 / 規約違反 / その他 |
| detail | TEXT | YES | |
| status | VARCHAR(20) | NO | open / resolved |
| action_taken | VARCHAR(20) | YES | keep / hide / remove / warn_author |
| resolved_by_user_id | UUID | YES | |
| resolved_at | TIMESTAMPTZ | YES | |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (status, created_at)` — 運営対応キュー

---

[← 07_tables_E_決済.md](07_tables_E_決済.md) | [次: 09_tables_G_運営監査.md →](09_tables_G_運営監査.md)
