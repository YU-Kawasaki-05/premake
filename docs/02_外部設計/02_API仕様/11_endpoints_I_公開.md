# API 仕様 — I. 公開導線

> [00_index.md](00_index.md) に戻る

### EP-I001: GET /api/v1/terms
**機能**: FR-61 利用規約取得
**認証**: 不要
**Query**: `version=v1.0` (省略時は最新)
**Response 200**: `{ "data": { "version", "body_md", "effective_from" } }`

### EP-I002: GET /api/v1/privacy
**機能**: FR-62
**Response 200**: 同上

### EP-I003: GET /api/v1/commerce-disclosure
**機能**: FR-63
**Response 200**: 同上

### EP-I004: POST /api/v1/contact
**機能**: FR-64 お問い合わせ送信
**認証**: 不要
**Request**:
```json
{
  "name": "...", "email": "...", "category": "...",
  "subject": "...", "body": "...",
  "recaptcha_token": "..."
}
```
**Response 201**: `{ "data": { "inquiry_id": "uuid" } }`
**副作用**: inquiries INSERT、運営通知、自動返信メール
**Errors**:
- 400 `RECAPTCHA_FAILED`
- 429 `RATE_LIMITED` (1h あたり 5 件 IP 制限)

### EP-I005: POST /api/v1/terms/{terms_type}/agree (内部)
**機能**: FR-61 / FR-62 同意ログ
**認証**: user
**Request**: `{ version: "v2.0" }`
**Response 204**: user_term_consents INSERT

---

## FR 対応表

| FR | EP |
|---|---|
| FR-61 | EP-I001, EP-I005 |
| FR-62 | EP-I002, EP-I005 |
| FR-63 | EP-I003 |
| FR-64 | EP-I004 |

---

[← 10_endpoints_H_運営.md](10_endpoints_H_運営.md) | [次: 12_endpoints_J_ダッシュボード.md →](12_endpoints_J_ダッシュボード.md)
