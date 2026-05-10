# DB 設計 — D. 医師指示・施術記録

> [00_index.md](00_index.md) に戻る

## TBL-prescriptions — 電子指示書（改ざん不可）
**関連機能**: FR-29

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_session_id | UUID | NO | FK |
| facility_id | UUID | NO | FK (RLS 用) |
| doctor_user_id | UUID | NO | FK → users (role=doctor) |
| nurse_user_id | UUID | NO | FK → users (role=nurse) |
| customer_name | TEXT | YES | 利用客名（暗号化推奨） |
| body | JSONB | NO | 指示内容（部位 / 色素 / 麻酔 / 注意事項） |
| consent_confirmed | BOOLEAN | NO | true |
| medical_history_confirmed | BOOLEAN | NO | true |
| signed_at | TIMESTAMPTZ | NO | |
| signature_x509 | BYTEA | NO | サーバー側署名 |
| timestamp_token | BYTEA | NO | RFC 3161 タイムスタンプ |
| status | VARCHAR(20) | NO | issued / revoked |
| revoked_at | TIMESTAMPTZ | YES | |
| revoke_reason | TEXT | YES | |
| revoked_by_user_id | UUID | YES | |
| superseded_by_prescription_id | UUID | YES | FK → prescriptions（再発行先） |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `INDEX (booking_session_id)`
- `INDEX (doctor_user_id, status)`
- `INDEX (facility_id, signed_at DESC)`

> **改ざん防止**: UPDATE / DELETE はトリガーで拒否（[01_設計方針.md §7](01_設計方針.md)）。状態遷移（revoke）は新規 INSERT 行で表現。

---

## TBL-prescription_pdfs

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| prescription_id | UUID | NO | FK |
| pdf_url | VARCHAR(500) | NO | Storage |
| hash_sha256 | BYTEA | NO | |
| file_size | INTEGER | NO | bytes |
| generated_at | TIMESTAMPTZ | NO | |
| version | SMALLINT | NO | 1 から |
| created_at | TIMESTAMPTZ | NO | |

**制約**: `UNIQUE (prescription_id, version)`

---

## TBL-consent_templates — 同意書テンプレ
**関連機能**: FR-31

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| owner_type | VARCHAR(20) | NO | 'platform' / 'facility' / 'nurse' |
| owner_id | UUID | YES | facility_id or user_id |
| version | SMALLINT | NO | 1 から |
| title | VARCHAR(200) | NO | |
| sections | JSONB | NO | [{heading, body, required_acknowledgement}] |
| is_active | BOOLEAN | NO | true |
| created_at | TIMESTAMPTZ | NO | |

**制約**: `UNIQUE (owner_type, owner_id, version)`

---

## TBL-customer_consents — 同意書記入（改ざん不可）
**関連機能**: FR-32

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_session_id | UUID | YES | FK |
| customer_booking_id | UUID | YES | FK |
| consent_template_version_id | UUID | NO | FK → consent_templates |
| sections_acknowledged | JSONB | NO | {section_id: true} |
| signature_image_url | VARCHAR(500) | NO | |
| signed_at | TIMESTAMPTZ | NO | |
| signed_ip | INET | NO | |
| user_agent | TEXT | YES | |
| guardian_required | BOOLEAN | NO | false |
| guardian_signature_image_url | VARCHAR(500) | YES | |
| pdf_url | VARCHAR(500) | YES | |
| hash_sha256 | BYTEA | YES | |
| created_at | TIMESTAMPTZ | NO | |

> **改ざん防止**: UPDATE / DELETE 禁止。修正は version インクリメントで再 INSERT。

---

## TBL-questionnaire_templates — 問診票テンプレ
**関連機能**: FR-71

| id, owner_type ('platform'/'nurse'), owner_id, version, title, sections (JSONB), is_active, created_at |

**制約**: `UNIQUE (owner_type, owner_id, version)`

---

## TBL-customer_questionnaire_responses — 問診票回答
**関連機能**: FR-72

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_session_id | UUID | YES | FK |
| customer_booking_id | UUID | YES | FK |
| questionnaire_template_version_id | UUID | NO | FK |
| responses | JSONB | NO | {q_id: answer} |
| critical_flags | TEXT[] | NO | '{}' | 「妊娠の可能性」等 |
| submitted_at | TIMESTAMPTZ | NO | |
| last_edited_at | TIMESTAMPTZ | YES | |
| edit_history | JSONB | NO | '[]' |
| created_at | TIMESTAMPTZ | NO | |

`critical_flags` は AI で自動抽出 → 医師確認を要する flag。

---

## TBL-treatment_records — 施術記録（改ざん不可）
**関連機能**: FR-33, FR-34

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| booking_session_id | UUID | NO | FK, UNIQUE（1 セッション 1 記録） |
| nurse_user_id | UUID | NO | FK |
| facility_id | UUID | NO | FK |
| body | JSONB | NO | 施術部位 / 色素 / 麻酔 / 所見 |
| started_at | TIMESTAMPTZ | NO | |
| ended_at | TIMESTAMPTZ | NO | |
| customer_satisfaction | SMALLINT | YES | 1〜5 |
| anomaly_notes | TEXT | YES | 異変・特記 |
| status | VARCHAR(20) | NO | submitted / revision_requested / confirmed |
| confirmed_at | TIMESTAMPTZ | YES | |
| confirmed_by_user_id | UUID | YES | doctor |
| revision_requested_at | TIMESTAMPTZ | YES | |
| revision_comment | TEXT | YES | |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | submitted→confirmed 等の状態遷移時のみ更新可（トリガー制限） |

> **改ざん防止**: `body` の中身は INSERT 後変更不可。状態遷移カラム（status / confirmed_at 等）のみ UPDATE 許可するトリガー。

---

## TBL-treatment_record_addenda — 施術記録の追記
**関連機能**: FR-34

| id, treatment_record_id, author_user_id, body (TEXT), created_at |

> 確認後の修正は追記のみ（FR-34 BR-04）。

---

## TBL-treatment_record_images — 施術前後写真
**関連機能**: FR-33

| id, treatment_record_id, image_url (Storage), kind ('before'/'after'), area (TEXT), encrypted_at, created_at |

**インデックス**: `INDEX (treatment_record_id, kind)`

---

[← 05_tables_C_予約顧客.md](05_tables_C_予約顧客.md) | [次: 07_tables_E_決済.md →](07_tables_E_決済.md)
