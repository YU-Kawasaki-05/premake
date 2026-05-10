# API 仕様 — H. 運営管理

> [00_index.md](00_index.md) に戻る

> すべて `ops` ロール必須、aal2 推奨。多くの操作で `requireRole(['ops'])` + `requireAAL2()` を併用。

## ユーザー管理

### EP-H001: GET /api/v1/ops/users
**機能**: FR-53 ユーザー一覧
**Query**: `role?, status?, license_status?, search?, cursor?`
**Response 200**: 一覧（PII マスキング、フル表示は EP-H002 で）

### EP-H002: GET /api/v1/ops/users/{id}
**機能**: FR-53 詳細（フル表示）
**Request**: `?reason={閲覧理由}`（クエリ必須）
**Response 200**
**副作用**: 監査ログに reason 記録

### EP-H003: POST /api/v1/ops/users/{id}/suspend
**機能**: FR-11
**Request**: `{ reason, ongoing_bookings: "cancel_all"|"keep_ongoing"|"review_each" }`
**Response 200**

### EP-H004: POST /api/v1/ops/users/{id}/unsuspend
**Request**: `{ reason }`

---

## 審査

### EP-H005: GET /api/v1/ops/license-applications
**機能**: FR-54 審査キュー
**Query**: `type=nurse|doctor|facility|organization&status=pending_review`

### EP-H006: GET /api/v1/ops/license-applications/{id}
**Response 200**: 申請詳細 + 添付画像署名付き URL（5 分）

### EP-H007: POST /api/v1/ops/license-applications/{id}/approve
**機能**: FR-54 / FR-08 / FR-09 / FR-10 / FR-82 承認
**Response 200**
**副作用**: 該当 users / facilities / organizations の status 更新、通知

### EP-H008: POST /api/v1/ops/license-applications/{id}/reject
**Request**: `{ reason: string }`

### EP-H009: POST /api/v1/ops/license-applications/{id}/request-info
**Request**: `{ message: string }`

---

## 違反案件・取引監視

### EP-H010: GET /api/v1/ops/violations
**機能**: FR-56
**Query**: `status?, severity?, target_type?`

### EP-H011: POST /api/v1/ops/violations
**機能**: FR-56 案件作成（手動）
**Request**: `{ target_type, target_id, severity, description, action, notification_method }`

### EP-H012: POST /api/v1/ops/violations/{id}/resolve
**Request**: `{ action, second_approver_id?, notes }` (suspend / force_cancel は `second_approver_id` 必須)
**Errors**: 422 `SECOND_APPROVAL_REQUIRED`

### EP-H013: GET /api/v1/ops/transactions
**機能**: FR-55 取引監視
**Query**: `status?, period?, anomaly?`
**Response 200**: 一覧（リアルタイム）

### EP-H014: GET /api/v1/ops/dashboard/alerts
**機能**: FR-55 / FR-68 異常検知一覧
**Response 200**: dispute / 同期エラー / 不正パターン等

---

## 監査ログ

### EP-H015: GET /api/v1/ops/audit-log
**機能**: FR-59 監査ログ閲覧
**Query**: `actor_id?, target_type?, target_id?, action_type?, from?, to?, keyword?`
**Response 200**: ログ一覧（自分の閲覧自体も記録される）

---

## エクスポート

### EP-H016: POST /api/v1/ops/exports
**機能**: FR-58 CSV 生成
**Request**:
```json
{
  "target": "transactions" | "users" | ...,
  "filter": {...},
  "include_pii": false,
  "format": "csv" | "tsv" | "xlsx"
}
```
**Response 200 (small)**: ZIP 直接ダウンロード
**Response 202 (large)**: `{ "data": { "export_id": "uuid" } }`、完了時にメール通知

### EP-H017: GET /api/v1/ops/exports/{id}
**Response 200**: 状態 + 完了なら署名付き DL URL（24h 有効）

### EP-H018: POST /api/v1/ops/exports/{id}/approve (PII 含む時)
**機能**: 別運営の二名承認
**Request**: `{ approver_id }`

---

## 代理オンボーディング

### EP-H019: POST /api/v1/ops/managed-onboarding
**機能**: FR-87 代理オンボーディング
**Request**:
```json
{
  "target_type": "organization" | "facility" | "facility_admin" | "doctor",
  "payload": {...},
  "consent_log_url": "...",      // 同意ログ（書面 / メール）
  "send_invite_to": "user@..."
}
```
**Response 201**: 該当エンティティ作成、仮パスワード付き案内メール送信

### EP-H020: POST /api/v1/ops/managed-onboarding/bulk
**機能**: FR-87 CSV 一括インポート
**Request** (multipart): csv file
**Response 202**: 非同期、結果レポートをメール

---

## お知らせ

### EP-H021: POST /api/v1/ops/announcements
**機能**: FR-60
**Request**: target_segment, channels, title, body, scheduled_at, expires_at
**Response 201**

### EP-H022: GET /api/v1/ops/announcements
### EP-H023: PUT /api/v1/ops/announcements/{id}
### EP-H024: DELETE /api/v1/ops/announcements/{id}

---

## FR 対応表

| FR | EP |
|---|---|
| FR-11 | EP-H003, EP-H004 |
| FR-53 | EP-H001, EP-H002 |
| FR-54 | EP-H005〜H009 |
| FR-55 | EP-H013, EP-H014 |
| FR-56 | EP-H010〜H012 |
| FR-57 | EP-E008（実装） |
| FR-58 | EP-H016, EP-H017, EP-H018 |
| FR-59 | EP-H015 |
| FR-60 | EP-H021〜H024 |
| FR-87 | EP-H019, EP-H020 |

---

[← 09_endpoints_G_レビュー.md](09_endpoints_G_レビュー.md) | [次: 11_endpoints_I_公開.md →](11_endpoints_I_公開.md)
