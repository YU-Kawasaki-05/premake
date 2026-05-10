# DB 設計 — A. 認証・組織・ユーザー

> [00_index.md](00_index.md) に戻る

## TBL-organizations — 法人
**関連機能**: FR-82, FR-83, FR-84, FR-85

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| name | VARCHAR(200) | NO | - | 法人名 |
| legal_form | VARCHAR(50) | NO | - | "医療法人"等 |
| corporate_number | VARCHAR(13) | NO | - | 法人番号 (UNIQUE) |
| founded_at | DATE | NO | - | 設立年月日 |
| representative_name | VARCHAR(100) | NO | - | 代表者氏名 |
| representative_title | VARCHAR(100) | NO | - | 役職 |
| address | TEXT | NO | - | 本部住所 |
| phone | VARCHAR(20) | NO | - | 連絡電話 |
| email | VARCHAR(255) | NO | - | 連絡メール |
| website | VARCHAR(500) | YES | NULL | 公式サイト |
| status | VARCHAR(20) | NO | 'pending_review' | pending_review / approved / rejected / suspended / closed |
| stripe_account_id | VARCHAR(100) | YES | NULL | 法人レベル Connect ID |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | |

**インデックス**:
- `UNIQUE (corporate_number)`
- `INDEX (status)` — 審査キュー
- `INDEX (created_at DESC)` — 最近申請順

**制約**:
- `CHECK (status IN ('pending_review', 'approved', 'rejected', 'suspended', 'closed'))`
- `CHECK (LENGTH(corporate_number) = 13)`

**RLS**: U-04 全閲覧可、U-06 自法人のみ閲覧編集可

---

## TBL-facilities — 医療機関
**関連機能**: FR-09, FR-13, FR-83

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| organization_id | UUID | YES | NULL | FK → organizations（独立施設は NULL） |
| name | VARCHAR(200) | NO | - | 機関名 |
| facility_type | VARCHAR(50) | NO | - | "病院" / "診療所" / "クリニック" |
| postal_code | VARCHAR(7) | NO | - | 郵便番号 |
| address | TEXT | NO | - | 住所 |
| location | GEOGRAPHY(POINT) | YES | NULL | 緯度経度 (PostGIS) |
| phone | VARCHAR(20) | NO | - | 代表電話 |
| email | VARCHAR(255) | NO | - | 代表メール |
| website | VARCHAR(500) | YES | NULL | - |
| founder_name | VARCHAR(100) | NO | - | 開設者氏名 |
| director_name | VARCHAR(100) | NO | - | 院長氏名 |
| medical_specialties | TEXT[] | NO | '{}' | 標榜診療科 |
| logo_url | VARCHAR(500) | YES | NULL | ロゴ URL |
| access_info | TEXT | YES | NULL | アクセス情報 |
| has_parking | BOOLEAN | NO | false | 駐車場有無 |
| license_number | VARCHAR(50) | NO | - | 開設届番号 |
| license_issued_at | DATE | NO | - | 開設許可日 |
| public_health_office | VARCHAR(100) | NO | - | 管轄保健所 |
| status | VARCHAR(20) | NO | 'pending_review' | pending_review / approved / rejected / suspended / closed / pending_re_review |
| stripe_account_id | VARCHAR(100) | YES | NULL | Connect ID（法人レベル使用時は NULL） |
| created_by_ops | BOOLEAN | NO | false | 代理オンボーディング由来か (FR-87) |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | |
| deleted_at | TIMESTAMPTZ | YES | NULL | ソフトデリート |

**インデックス**:
- `INDEX (organization_id)` — 法人配下検索
- `INDEX (status)`
- `INDEX USING GIST (location)` — 距離検索 (FR-19)
- `INDEX (license_number)` — 重複検知

---

## TBL-users — 全ユーザー（U-01〜U-06）
**関連機能**: FR-01〜FR-12, FR-81

> Supabase Auth の `auth.users` と 1:1 で紐付ける（`id` は同一 UUID）。

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| id | UUID | NO | - | PK = auth.users.id |
| role | VARCHAR(20) | NO | - | nurse / facility_admin / doctor / ops / org_admin |
| email | VARCHAR(255) | NO | - | UNIQUE |
| email_verified | BOOLEAN | NO | false | (FR-06) |
| phone | VARCHAR(20) | NO | - | E.164 |
| phone_verified | BOOLEAN | NO | false | |
| name | VARCHAR(100) | NO | - | 氏名（漢字） |
| name_kana | VARCHAR(100) | NO | - | 氏名（カナ） |
| facility_id | UUID | YES | NULL | facility_admin / doctor の所属（メイン）。FK → facilities |
| organization_id | UUID | YES | NULL | org_admin の所属。FK → organizations |
| google_sub | VARCHAR(50) | YES | NULL | Google OAuth (FR-81)、UNIQUE |
| status | VARCHAR(20) | NO | 'email_unverified' | email_unverified / active / suspended |
| license_status | VARCHAR(20) | YES | NULL | nurse/doctor のみ。pending_review / approved / rejected / info_required |
| can_book | BOOLEAN | NO | false | nurse の予約権限 (FR-08 承認後) |
| prescription_issue_enabled | BOOLEAN | NO | false | doctor の指示書発行権限 (FR-10 承認後) |
| mfa_enabled | BOOLEAN | NO | false | (FR-07) |
| mfa_method | VARCHAR(10) | YES | NULL | totp / sms |
| warning_count | SMALLINT | NO | 0 | 警告累積 (FR-52) |
| email_bounce_flag | BOOLEAN | NO | false | (FR-46) |
| created_by_ops | BOOLEAN | NO | false | 代理オンボーディング由来 (FR-87) |
| last_login_at | TIMESTAMPTZ | YES | NULL | |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | |
| deleted_at | TIMESTAMPTZ | YES | NULL | |

**インデックス**:
- `UNIQUE (email)`
- `UNIQUE (google_sub) WHERE google_sub IS NOT NULL`
- `INDEX (role, status)` — 一覧
- `INDEX (facility_id) WHERE facility_id IS NOT NULL`
- `INDEX (organization_id) WHERE organization_id IS NOT NULL`
- `INDEX (license_status) WHERE license_status IS NOT NULL` — 審査キュー

**制約**:
- `CHECK (role IN ('nurse', 'facility_admin', 'doctor', 'ops', 'org_admin'))`
- `CHECK (status IN ('email_unverified', 'active', 'suspended'))`
- `CHECK (license_status IS NULL OR license_status IN ('pending_review', 'approved', 'rejected', 'info_required'))`

---

## TBL-doctor_profiles — 医師固有情報
**関連機能**: FR-03, FR-10

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| user_id | UUID | NO | PK, FK → users |
| medical_registration_number | VARCHAR(20) | NO | 医籍登録番号 (UNIQUE) |
| medical_registration_date | DATE | NO | 登録年月日 |
| specialties | TEXT[] | NO | 診療科 |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**制約**: `UNIQUE (medical_registration_number)`

---

## TBL-nurse_profiles — 看護師固有情報
**関連機能**: FR-08

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| user_id | UUID | NO | PK, FK → users |
| nurse_registration_number | VARCHAR(20) | NO | 籍登録番号 (UNIQUE) |
| nurse_registration_date | DATE | NO | 登録年月日 |
| registered_prefecture | VARCHAR(10) | NO | 本籍都道府県 |
| handle | VARCHAR(30) | NO | 公開ページ slug (FR-69) UNIQUE |
| profile_image_url | VARCHAR(500) | YES | プロフィール写真 |
| bio | TEXT | YES | 自己紹介 |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**制約**:
- `UNIQUE (nurse_registration_number)`
- `UNIQUE (handle)`
- `CHECK (handle ~ '^[a-z0-9-]{3,30}$')`

---

## TBL-doctor_facility_assignments — 医師と施設の M:N
**関連機能**: FR-03, FR-18

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| doctor_user_id | UUID | NO | FK → users (role=doctor) |
| facility_id | UUID | NO | FK → facilities |
| is_primary | BOOLEAN | NO | 主たる勤務先 |
| is_default_doctor | BOOLEAN | NO | 施設のデフォルト指示医 (FR-18) |
| target_space_ids | UUID[] | YES | 担当スペース（NULL=全） |
| target_time_window | JSONB | YES | 担当時間帯 |
| status | VARCHAR(20) | NO | active / inactive |
| created_at | TIMESTAMPTZ | NO | |

**制約**:
- `UNIQUE (doctor_user_id, facility_id)`
- `EXCLUDE (facility_id WITH =) WHERE (is_default_doctor = true)` — 1 施設 1 デフォルト

**インデックス**: `INDEX (facility_id, status)`

---

## TBL-invitations — 招待
**関連機能**: FR-02, FR-03, FR-84, FR-87

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| token | VARCHAR(100) | NO | UNIQUE, URL に含むトークン |
| code | VARCHAR(8) | YES | 招待コード（コード経路の場合） |
| invitee_email | VARCHAR(255) | NO | 招待先メール |
| invitee_role | VARCHAR(20) | NO | facility_admin / doctor / org_admin |
| facility_id | UUID | YES | FK |
| organization_id | UUID | YES | FK |
| inviter_user_id | UUID | NO | FK → users |
| invitation_type | VARCHAR(20) | NO | link / code / application_approved / managed_onboarding |
| status | VARCHAR(20) | NO | active / consumed / revoked / expired |
| expires_at | TIMESTAMPTZ | NO | 72h デフォルト |
| consumed_at | TIMESTAMPTZ | YES | 受諾時刻 |
| consumed_by_user_id | UUID | YES | FK → users |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (token)`
- `INDEX (code) WHERE code IS NOT NULL`
- `INDEX (status, expires_at)` — 失効ジョブ用
- `INDEX (invitee_email, invitee_role, facility_id) WHERE status='active'`

---

## TBL-mfa_settings — MFA 設定
**関連機能**: FR-07

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| user_id | UUID | NO | PK, FK |
| method | VARCHAR(10) | NO | totp / sms |
| totp_secret_encrypted | BYTEA | YES | pgcrypto で暗号化 |
| sms_phone | VARCHAR(20) | YES | SMS 用 |
| enabled_at | TIMESTAMPTZ | NO | |
| created_at | TIMESTAMPTZ | NO | |

---

## TBL-mfa_backup_codes
**関連機能**: FR-07

| user_id, code_hash, used_at, created_at |

10 個発行、各 1 回限り使用。

---

## TBL-user_sessions — セッション
**関連機能**: FR-04, FR-12

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| user_id | UUID | NO | FK |
| device_label | VARCHAR(200) | YES | UA から推定 |
| ip | INET | YES | |
| last_active_at | TIMESTAMPTZ | NO | |
| expires_at | TIMESTAMPTZ | NO | remember_me で延長 |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (user_id, last_active_at DESC)`

> 注: Supabase Auth と併用なので、auth.sessions が一次。本テーブルは UI 用補助。

---

## TBL-nurse_license_applications — 看護師免許審査
**関連機能**: FR-08

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| user_id | UUID | NO | FK → users |
| license_image_front_url | VARCHAR(500) | NO | Storage path |
| license_image_back_url | VARCHAR(500) | YES | |
| selfie_with_license_url | VARCHAR(500) | NO | 自撮り |
| nurse_registration_number | VARCHAR(20) | NO | |
| nurse_registration_date | DATE | NO | |
| registered_prefecture | VARCHAR(10) | NO | |
| status | VARCHAR(20) | NO | pending_review / approved / rejected / info_required |
| reviewed_by_user_id | UUID | YES | FK → users (ops) |
| reviewed_at | TIMESTAMPTZ | YES | |
| reject_reason | TEXT | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**インデックス**: `INDEX (status, created_at)` — 審査キュー

---

## TBL-doctor_license_applications — 医師免許審査
**関連機能**: FR-10

`nurse_license_applications` と同形式。差分カラム:
- `medical_registration_number VARCHAR(20)`
- `medical_registration_date DATE`
- `specialty_certificates_url VARCHAR(500) YES`（専門医資格証明）

---

## TBL-facility_license_applications — 施設開設届審査
**関連機能**: FR-09

| id, facility_id (FK), license_image_url, license_number, license_issued_at, public_health_office, applicant_id_image_url, applicant_selfie_url, organization_id (YES), status, reviewed_by_user_id, reviewed_at, reject_reason, created_at, updated_at |

---

## TBL-organization_applications — 法人申請
**関連機能**: FR-82

| id, organization_id (FK), registration_certificate_url, status, reviewed_by_user_id, reviewed_at, reject_reason, created_at, updated_at |

---

## TBL-user_term_consents — 規約同意ログ
**関連機能**: FR-61, FR-62

| user_id, term_version_id, terms_type ('tos'/'privacy'), agreed_at, ip |

`UNIQUE (user_id, term_version_id, terms_type)` で多重同意を許可（バージョンが上がるたびに追加）。

---

[← 02_ER図.md](02_ER図.md) | [次: 04_tables_B_スペース.md →](04_tables_B_スペース.md)
