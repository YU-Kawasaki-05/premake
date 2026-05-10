# API 仕様 — F. メッセージ・通知

> [00_index.md](00_index.md) に戻る

## チャット（β）

### EP-F001: GET /api/v1/bookings/{id}/chat
**機能**: FR-45 スレッド情報 + 最近のメッセージ
**認証**: user (関係者)
**Response 200**: メッセージ一覧（最新 50 件）

### EP-F002: POST /api/v1/bookings/{id}/chat/messages
**機能**: FR-45 送信
**認証**: user (関係者)
**Request**: `{ body: string, attachments?: [file_ids] }`
**Response 201**
**副作用**: SSE / WebSocket でリアルタイム配信、相手側に通知

### EP-F003: POST /api/v1/bookings/{id}/chat/attachments
**機能**: FR-45 添付アップロード
**Request** (multipart): files[] (max 3, 5MB each)

### EP-F004: POST /api/v1/bookings/{id}/chat/messages/{mid}/read
**機能**: FR-45 既読

### EP-F005: GET /api/v1/bookings/{id}/chat/stream
**機能**: SSE エンドポイント（リアルタイム購読）
**認証**: user
**Response**: text/event-stream

---

## 通知（アプリ内）

### EP-F006: GET /api/v1/notifications
**機能**: FR-46 / FR-47 自分の通知一覧
**認証**: user
**Query**: `unread_only=true&cursor=...`
**Response 200**: 通知配列

### EP-F007: POST /api/v1/notifications/{id}/read
**Response 204**

### EP-F008: POST /api/v1/notifications/read-all

### EP-F009: GET /api/v1/notifications/unread-count
**Response 200**: `{ "data": { "count": 5 } }`

---

## 通知設定

### EP-F010: GET /api/v1/notification-preferences
**機能**: FR-48
**Response 200**: `{ "data": { "preferences": [{ event_type, channel, enabled }] } }`

### EP-F011: PUT /api/v1/notification-preferences
**Request**: `{ preferences: [...] }`
**Errors**: 422 `MANDATORY_NOTIFICATION` — 強制送信イベントを off にしようとした

---

## SMS 認証コード送信（バックエンド経由）

### EP-F012: POST /api/v1/notifications/sms/send (internal)
**機能**: FR-47 SMS 送信トリガー（worker_jobs から呼ばれる）
**認証**: service only

> 通常は worker_jobs.send_sms ジョブとして実装、外部 API としては非公開。

---

## FR 対応表

| FR | EP |
|---|---|
| FR-45 | EP-F001〜F005 |
| FR-46 | EP-F006〜F009（受信側）+ worker_jobs.send_email |
| FR-47 | EP-F006〜F009 + worker_jobs.send_sms |
| FR-48 | EP-F010, EP-F011 |

---

[← 07_endpoints_E_決済.md](07_endpoints_E_決済.md) | [次: 09_endpoints_G_レビュー.md →](09_endpoints_G_レビュー.md)
