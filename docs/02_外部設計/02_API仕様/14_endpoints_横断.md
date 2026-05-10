# API 仕様 — 横断・運用基盤

> [00_index.md](00_index.md) に戻る

### EP-X001: GET /api/health
**機能**: FR-80 ヘルスチェック（内部用）
**認証**: 不要 (Vercel Health Check)
**Response 200**: `{ "data": { "ok": true, "ts": "..." } }`
**Response 503**: degraded / outage

### EP-X002: GET /api/v1/status
**機能**: FR-80 公開ステータスページ用 API
**認証**: 不要
**Response 200**:
```json
{ "data": {
  "services": [
    { "name": "api", "status": "ok" },
    { "name": "stripe", "status": "ok" },
    { "name": "email", "status": "degraded" },
    ...
  ],
  "incidents": [...],
  "scheduled_maintenance": [...]
}}
```

### EP-X003: GET /api/v1/feature-flags
**機能**: FR-79 クライアント評価用
**認証**: 不要 (有効化判定はサーバー側 RSC で行うが、クライアント切り替えに必要なフラグだけ公開)
**Response 200**: 公開可能なフラグのみ（kill switch / experiment 等は非公開）

### EP-X004: PUT /api/v1/ops/feature-flags/{key}
**機能**: FR-79 フラグ更新
**認証**: ops (aal2)
**Request**: `{ enabled, strategy, value }`
**Response 200**

### EP-X005: GET /api/v1/ops/feature-flags
**認証**: ops

### EP-X006: POST /api/v1/ops/jobs/run (緊急時手動実行)
**機能**: FR-77 ジョブ手動キック
**認証**: ops (aal2)
**Request**: `{ job_type, payload }`
**Response 202**: `{ "data": { "job_id": "uuid" } }`

### EP-X007: GET /api/v1/ops/jobs
**機能**: FR-77 ジョブ監視
**認証**: ops
**Query**: `status?, job_type?, from?, to?`
**Response 200**: 一覧 + 失敗率 / 遅延統計

---

## FR 対応表

| FR | EP |
|---|---|
| FR-77 | EP-X006, EP-X007 |
| FR-79 | EP-X003, EP-X004, EP-X005 |
| FR-80 | EP-X001, EP-X002 |

---

[← 13_endpoints_K_顧客予約.md](13_endpoints_K_顧客予約.md) | [次: 15_quickref_エンドポイント一覧.md →](15_quickref_エンドポイント一覧.md)
