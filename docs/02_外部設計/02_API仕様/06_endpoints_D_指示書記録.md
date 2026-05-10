# API 仕様 — D. 医師指示・施術記録

> [00_index.md](00_index.md) に戻る

## 指示医通知（バックグラウンド経由）

> EP は不要（worker_jobs と通知 EP に集約。FR-28 は通知 / リマインドジョブの起点）

---

## 電子指示書

### EP-D001: GET /api/v1/prescriptions
**機能**: FR-29 一覧（指示医インボックス）
**認証**: user (doctor) or facility_admin (自施設)
**Query**: `status=pending|issued|revoked&from&to`
**Response 200**: 指示書一覧

### EP-D002: GET /api/v1/prescriptions/{id}
**認証**: user (関係者)
**Response 200**: 指示書詳細

### EP-D003: POST /api/v1/prescriptions
**機能**: FR-29 電子指示書発行
**認証**: user (doctor, prescription_issue_enabled=true, aal2)
**Request**:
```json
{
  "booking_session_id": "uuid",
  "body": {
    "areas": ["眉"],
    "pigments": [{ "product": "...", "color": "...", "lot": "..." }],
    "anesthesia": { "type": "...", "amount_ml": 1.0 },
    "notes": "..."
  },
  "consent_confirmed": true,
  "medical_history_confirmed": true,
  "totp_code": "..."             // aal2 再確認
}
```
**Response 201**:
```json
{ "data": { "prescription_id": "uuid", "pdf_status": "queued" } }
```
**副作用**:
- prescriptions INSERT (status=issued, signed_at, signature_x509, timestamp_token)
- prescription_pdfs 生成ジョブ投入
- booking_sessions.prescription_id 更新
- 看護師通知

**Errors**:
- 403 `FOREIGN_FACILITY_BOOKING`
- 422 `CONSENT_NOT_SIGNED`
- 422 `QUESTIONNAIRE_NOT_SUBMITTED`
- 409 `ALREADY_ISSUED`

### EP-D004: POST /api/v1/prescriptions/{id}/revoke
**機能**: FR-29 失効（再発行起点）
**認証**: user (発行医師、aal2)
**Request**: `{ reason: string }`
**Response 200**

### EP-D005: GET /api/v1/prescriptions/{id}/pdf
**機能**: FR-30 PDF 取得（署名付き URL）
**認証**: user (関係者)
**Response 200**: `{ "data": { "url": "https://...", "expires_at": "..." } }`（5 分有効）
**副作用**: 監査ログ記録

### EP-D006: GET /verify/prescription/{id} (公開検証)
**機能**: FR-30 QR コード検証
**認証**: 不要（公開、PII は出さない）
**Response 200**: `{ "data": { "issued_at", "signature_valid": true, "doctor_name_initial": "Y.K." } }`

---

## 同意書テンプレート

### EP-D007: GET /api/v1/consent-templates
**機能**: FR-31
**認証**: user
**Query**: `owner_type=platform|facility|nurse&owner_id=...`

### EP-D008: POST /api/v1/consent-templates
**機能**: FR-31
**認証**: user (facility_admin / nurse / ops platform 用)
**Request**: title, sections（必須項目は法令上必須として保護）

### EP-D009: PUT /api/v1/consent-templates/{id}
**Request**: 内容変更（version インクリメント）
**Errors**: 422 `REQUIRED_SECTION_DELETION` — 法令必須項目削除を試みた

---

## 利用客同意書記入（ゲスト）

### EP-D010: GET /api/c/consents/{token}
**機能**: FR-32 同意書記入画面表示
**認証**: token のみ（メール経由のリンク）
**Response 200**: テンプレート + 既存記入内容（あれば）

### EP-D011: POST /api/c/consents/{token}
**機能**: FR-32 提出
**認証**: token + customer_email 一致確認
**Request**:
```json
{
  "sections_acknowledged": { "section_1": true, ... },
  "signature_image": "data:image/png;base64,...",
  "guardian": null | { "name", "relationship", "signature_image" }
}
```
**Response 201**: `{ "data": { "consent_id": "uuid", "pdf_status": "queued" } }`
**副作用**: customer_consents INSERT、PDF 生成ジョブ、看護師通知

---

## 問診票

### EP-D012: GET /api/v1/questionnaire-templates
### EP-D013: POST /api/v1/questionnaire-templates (nurse only for own)
### EP-D014: PUT /api/v1/questionnaire-templates/{id}

### EP-D015: GET /api/c/questionnaires/{token}
**機能**: FR-72 利用客向け表示
**認証**: token

### EP-D016: POST /api/c/questionnaires/{token}
**機能**: FR-72 回答送信
**Request**: responses (object)
**Response 201**:
```json
{ "data": {
  "questionnaire_response_id": "uuid",
  "critical_flags": ["pregnancy_possibility"]
}}
```
**副作用**: critical_flags 検出時は医師にも高優先度通知

---

## 施術記録

### EP-D017: GET /api/v1/treatment-records
**機能**: FR-35 一覧・検索
**認証**: user (権限内)
**Query**: `nurse_user_id?, facility_id?, doctor_user_id?, status?, from?, to?, keyword?`
**Response 200**: 一覧（PII マスキング適用、運営は理由必須で全件）

### EP-D018: GET /api/v1/treatment-records/{id}
**Response 200**: 詳細（写真は署名付き URL）

### EP-D019: POST /api/v1/treatment-records
**機能**: FR-33 投入
**認証**: user (nurse, 担当 booking_session)
**Request**:
```json
{
  "booking_session_id": "uuid",
  "body": {
    "areas": ["眉"],
    "pigments": [{ "product", "color", "lot" }],
    "anesthesia": null | {...},
    "notes": "..."
  },
  "started_at": "...", "ended_at": "...",
  "customer_satisfaction": 5,
  "anomaly_notes": null
}
```
**Response 201**: `{ "data": { "record_id": "uuid", "status": "submitted" } }`

### EP-D020: POST /api/v1/treatment-records/{id}/images
**機能**: FR-33 写真アップロード
**認証**: user (担当看護師)
**Request** (multipart): files[], kind ('before'/'after'), area
**Response 201**: 画像 ID 一覧

### EP-D021: PUT /api/v1/treatment-records/{id}
**機能**: FR-33 編集（指示医確認前のみ）
**Errors**: 422 `RECORD_ALREADY_CONFIRMED`

### EP-D022: POST /api/v1/treatment-records/{id}/confirm
**機能**: FR-34 確認
**認証**: user (doctor, 担当)
**Request**: `{ doctor_notes?: string }`
**Response 200**: status=confirmed
**副作用**: 決済確定 (FR-38) ジョブキック

### EP-D023: POST /api/v1/treatment-records/{id}/request-revision
**機能**: FR-34
**Request**: `{ comment: string }`
**Response 200**: status=revision_requested

### EP-D024: POST /api/v1/treatment-records/{id}/addenda
**機能**: FR-34 追記
**認証**: user (関係者)
**Request**: `{ body: string }`
**Response 201**

---

## FR 対応表

| FR | EP |
|---|---|
| FR-29 | EP-D001〜D004 |
| FR-30 | EP-D005, EP-D006 |
| FR-31 | EP-D007〜D009 |
| FR-32 | EP-D010, EP-D011 |
| FR-33 | EP-D019, EP-D020, EP-D021 |
| FR-34 | EP-D022, EP-D023, EP-D024 |
| FR-35 | EP-D017, EP-D018 |
| FR-71 | EP-D012, EP-D013, EP-D014 |
| FR-72 | EP-D015, EP-D016 |

---

[← 05_endpoints_C_予約.md](05_endpoints_C_予約.md) | [次: 07_endpoints_E_決済.md →](07_endpoints_E_決済.md)
