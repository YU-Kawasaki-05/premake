# API 仕様 — K. 顧客予約ページ

> [00_index.md](00_index.md) に戻る

> 利用客（U-05）は会員登録なし（DEC-12）。すべて Route Handler（公開 / ゲスト）。

## 看護師の公開ページ管理

### EP-K001: GET /api/v1/nurse-pages/me
**機能**: FR-69 自分のページ取得
**認証**: user (nurse)

### EP-K002: PUT /api/v1/nurse-pages/me
**機能**: FR-69 編集
**Request**: handle, profile_image_url, bio, menus, consultation_setting, prepayment_setting, visibility, faq, custom_cancel_policy
**Errors**: 409 `HANDLE_TAKEN`, 422 `LICENSE_NOT_APPROVED`

### EP-K003: GET /api/v1/nurse-pages/handle-availability?handle=...
**機能**: ハンドル重複チェック

---

## 看護師の問診票テンプレ（再掲、FR-71）

→ [`06_endpoints_D_指示書記録.md`](06_endpoints_D_指示書記録.md) の EP-D012〜D014 を使用

---

## 公開ブッキングページ閲覧（公開）

### EP-K004: GET /api/c/n/{handle}
**機能**: FR-69 公開ブッキングページ
**認証**: 不要
**Response 200**:
```json
{ "data": {
  "nurse_name": "...",
  "profile_image_url": "...",
  "bio": "...",
  "menus": [...],
  "consultation_setting": "optional",
  "prepayment_setting": "optional",
  "average_rating": 4.6,
  "review_count": 12,
  "custom_cancel_policy": "..."
}}
```

### EP-K005: GET /api/c/n/{handle}/availability
**機能**: 看護師の予約可能枠
**Query**: `from=YYYY-MM-DD&to=YYYY-MM-DD&menu_id=...`
**Response 200**: 看護師が確保しているスペース枠から、メニュー時間で分割した可用スロット

---

## ゲスト予約

### EP-K006: POST /api/c/n/{handle}/bookings/draft
**機能**: FR-70 仮予約（SMS 認証前）
**認証**: 不要
**Request**:
```json
{
  "menu_id": "uuid",
  "start_at": "...", "end_at": "...",
  "customer_name": "山田 太郎",
  "customer_name_kana": "ヤマダ タロウ",
  "customer_email": "...",
  "customer_phone": "+81-90-...",
  "customer_birthday": "1990-01-15",
  "customer_gender": "f",
  "guardian": null | { "name", "relationship", "phone", "email" },
  "free_memo": "..."
}
```
**Response 201**:
```json
{ "data": { "draft_token": "...", "sms_otp_sent_to": "+81-90-***-1234" } }
```
**副作用**: customer_bookings INSERT (status=tentative)、SMS OTP 送信

### EP-K007: POST /api/c/bookings/{draft_token}/verify-sms
**機能**: FR-70 / FR-47 SMS OTP 検証
**Request**: `{ code: string }`
**Response 200**:
```json
{ "data": {
  "booking_id": "uuid",
  "booking_number": "K-XXXXXXXX",
  "consent_link": "https://.../c/consents/...",
  "questionnaire_link": "https://.../c/questionnaires/...",
  "prepayment_required": false
}}
```
**副作用**: customer_bookings.status=confirmed、関連 booking_session に紐付け、看護師通知、利用客に確認メール+SMS（FR-73）

### EP-K008: POST /api/c/bookings/{draft_token}/resend-sms
**Errors**: 429（同番号 5 通/h 超過）

---

## 予約照会（メール+番号）

### EP-K009: POST /api/c/lookup/request-otp
**機能**: FR-74 OTP 要求
**Request**: `{ email: string, booking_number: string, phone_last4: string }`
**Response 200**: SMS OTP 送信（該当予約があれば）。常に成功扱いで PII 漏洩防止
**副作用**: customer_bookings 検索 → SMS 発火

### EP-K010: POST /api/c/lookup/verify-otp
**機能**: FR-74 検証
**Request**: `{ email, booking_number, code }`
**Response 200**: `{ "data": { "session_token": "..." } }`、Set-Cookie: guest_session (30 分)

### EP-K011: GET /api/c/bookings (with guest session)
**機能**: FR-74 自分の予約一覧
**認証**: guest session

### EP-K012: GET /api/c/bookings/{booking_id} (with guest session)
**機能**: FR-74 詳細

---

## 予約変更・キャンセル（利用客）

### EP-K013: POST /api/c/bookings/{id}/modify
**機能**: FR-75 変更
**認証**: guest session
**Request**: `{ new_start_at, new_end_at }`
**Response 200**: 看護師の空き枠と整合チェック後 OK

### EP-K014: POST /api/c/bookings/{id}/cancel
**機能**: FR-75 キャンセル
**Request**: `{ reason?: string }`
**Response 200**: ポリシー判定 → 自動返金（事前決済済の場合）
**副作用**: 看護師に即時通知、関連 booking_session の処理

---

## 同意書 / 問診票（再掲、ゲスト用）

→ [`06_endpoints_D_指示書記録.md`](06_endpoints_D_指示書記録.md) の EP-D010, EP-D011, EP-D015, EP-D016

---

## FR 対応表

| FR | EP |
|---|---|
| FR-69 | EP-K001〜K003, EP-K004 |
| FR-70 | EP-K006, EP-K007, EP-K008 |
| FR-71 | EP-D012〜D014 |
| FR-72 | EP-D015, EP-D016 |
| FR-73 | EP-K007（送信トリガー）+ worker_jobs.send_sms / send_email |
| FR-74 | EP-K009〜K012 |
| FR-75 | EP-K013, EP-K014 |

---

[← 12_endpoints_J_ダッシュボード.md](12_endpoints_J_ダッシュボード.md) | [次: 14_endpoints_横断.md →](14_endpoints_横断.md)
