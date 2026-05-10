# API 仕様 — E. 決済（Stripe）

> [00_index.md](00_index.md) に戻る

## カード登録（看護師）

### EP-E001: POST /api/v1/payment-methods/setup-intent
**機能**: FR-36 SetupIntent 発行
**認証**: user (nurse)
**Response 200**: `{ "data": { "client_secret": "..." } }`
（フロントの Stripe Elements で確認）

### EP-E002: POST /api/v1/payment-methods/confirm
**機能**: FR-36 登録確定
**Request**: `{ payment_method_id: string, set_default: boolean }`
**Response 201**

### EP-E003: GET /api/v1/payment-methods
**Response 200**: 自分のカード一覧（最後 4 桁 / brand のみ表示）

### EP-E004: DELETE /api/v1/payment-methods/{id}

### EP-E005: POST /api/v1/payment-methods/{id}/default

---

## Stripe Webhook

### EP-E006: POST /api/webhooks/stripe
**機能**: FR-42 受信
**認証**: 署名検証（`Stripe-Signature` ヘッダ + `STRIPE_WEBHOOK_SECRET`）
**実装**: Route Handler（Service Role 使用）

**処理イベント**:
- payment_intent.created / .succeeded / .canceled / .payment_failed
- charge.captured / .refunded / .dispute.created
- transfer.created / .reversed / .failed
- account.updated (Connect)
- setup_intent.succeeded
- customer.updated / .deleted

**Response 2xx 即時**、重い処理は worker_jobs にキュー投入

**副作用**:
- stripe_events に冪等管理（event.id を PK）
- payments / customer_payments / refunds / stripe_connect_accounts のステータス同期
- dispute は即時 Slack/メール通知

**Errors**: 400 署名検証失敗、200 (event.id 重複は冪等成功扱い)

---

## 決済操作（システム / 運営）

### EP-E007: POST /api/v1/payments/{id}/capture (内部)
**機能**: FR-38 手動キャプチャトリガー
**認証**: ops only
**Note**: 通常は施術記録確認 (EP-D022) で自動キック。緊急用。

### EP-E008: POST /api/v1/refunds
**機能**: FR-40 / FR-57 返金実行
**認証**: ops (大口は二名承認 EP-H010 経由)
**Request**:
```json
{
  "payment_id": "uuid",  // または customer_payment_id
  "amount": 4000,        // null なら全額
  "reason": "..."
}
```
**Response 201**: `{ "data": { "refund_id": "uuid", "stripe_refund_id": "re_..." } }`
**副作用**: Stripe Refund 実行 + Transfer reversal（必要時）

### EP-E009: GET /api/v1/refunds
**認証**: ops or 関係ユーザー（自分の予約に紐づく）

---

## 利用客事前決済（ゲスト）

### EP-E010: POST /api/c/payments/{customer_booking_token}/setup
**機能**: FR-39 Stripe Element 用 client secret 発行
**認証**: token + customer_email
**Response 200**: `{ "data": { "client_secret": "...", "amount": 30000 } }`

### EP-E011: POST /api/c/payments/{customer_booking_token}/confirm
**機能**: FR-39 決済確定通知
**認証**: token
**Request**: `{ payment_intent_id: string }`
**Response 200**: customer_payments 更新

---

## 明細・入金

### EP-E012: GET /api/v1/finance/statements
**機能**: FR-43 手数料明細
**認証**: user (nurse / facility_admin / org_admin)
**Query**: `period=2026-04&group_by=month|day`
**Response 200**:
```json
{ "data": {
  "summary": { "gmv": 100000, "platform_fee": 15000, "net": 85000 },
  "transactions": [...],
  "is_finalized": true
}}
```

### EP-E013: GET /api/v1/finance/statements/export
**機能**: FR-43 / FR-58 CSV エクスポート（小規模即時）
**認証**: user
**Response 200**: CSV ダウンロード

### EP-E014: GET /api/v1/facilities/{id}/payouts
**機能**: FR-44 入金スケジュール
**認証**: facility_admin or org_admin
**Response 200**: Stripe Payouts API を集約

---

## FR 対応表

| FR | EP |
|---|---|
| FR-36 | EP-E001〜E005 |
| FR-38 | EP-E007（自動は EP-D022 trigger） |
| FR-39 | EP-E010, EP-E011 |
| FR-40 | EP-E008, EP-E009 |
| FR-42 | EP-E006 |
| FR-43 | EP-E012, EP-E013 |
| FR-44 | EP-E014 |

---

[← 06_endpoints_D_指示書記録.md](06_endpoints_D_指示書記録.md) | [次: 08_endpoints_F_通知.md →](08_endpoints_F_通知.md)
