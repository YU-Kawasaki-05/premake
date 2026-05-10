# API 仕様 — C. 検索・予約

> [00_index.md](00_index.md) に戻る

## 検索・閲覧

### EP-C001: GET /api/v1/spaces/search
**機能**: FR-19 スペース検索
**認証**: user (role=nurse, license_status=approved)
**Query**:
```
?region=東京都
&from=2026-06-15T14:00:00+09:00
&to=2026-06-15T16:00:00+09:00
&equipments=拡大鏡,Wi-Fi
&max_price=8000
&min_rating=4.0
&sort=distance|price|rating|new
&cursor=...
&limit=20
```
**Response 200**:
```json
{ "data": [
  { "id": "uuid", "name": "...", "facility_name": "...", "thumbnail_url": "...",
    "distance_km": 1.2, "estimated_price": 10000, "average_rating": 4.6, "equipments": [...] }
], "page": { "cursor": "...", "limit": 20 } }
```
**Errors**: 403 `LICENSE_NOT_APPROVED`

### EP-C002: GET /api/v1/spaces/{id}
**機能**: FR-20 詳細閲覧
**認証**: user
**Response 200**: スペース詳細 + 施設情報 + 公開料金 + 公開空き枠 + レビュー要約

---

## 予約申込・承認

### EP-C003: POST /api/v1/bookings
**機能**: FR-21 予約申込
**認証**: user (role=nurse, can_book=true)
**Request**:
```json
{
  "space_id": "uuid",
  "sessions": [
    { "type": "consultation", "start_at": "2026-06-15T13:30+09:00", "end_at": "..." },
    { "type": "treatment", "start_at": "2026-06-15T14:00+09:00", "end_at": "..." }
  ],
  "menu_items": ["眉"],
  "usage_purpose": "...",
  "customer_booking_ids": []          // K カテゴリ事前紐付け（任意）
}
```
**Response 201**:
```json
{ "data": { "booking_id": "uuid", "booking_number": "B-XXX", "status": "pending_approval", "amount_estimate": 10000 } }
```

**副作用**:
- `bookings` + `booking_sessions` INSERT
- 施設・指示医に通知（FR-28）
- 48h 自動キャンセルジョブ投入

**Errors**:
- 422 `BOOKING_SLOT_TAKEN` — 空き枠と衝突
- 422 `NURSE_DOUBLE_BOOKING` — 自分の他予約と衝突
- 422 `CARD_NOT_REGISTERED`
- 403 `LICENSE_NOT_APPROVED`

---

### EP-C004: POST /api/v1/bookings/{id}/approve
**機能**: FR-22 予約承認
**認証**: user (facility_admin / 自施設)
**Response 200**: `{ "data": { "status": "approved" } }`
**副作用**: Stripe Authorization 取得、指示医通知、看護師通知
**Errors**:
- 422 `STRIPE_AUTH_FAILED` — オーソリ失敗
- 409 `ALREADY_APPROVED_FOR_OTHER` — 同時刻の他予約が先勝ち

### EP-C005: POST /api/v1/bookings/{id}/reject
**機能**: FR-22 拒否
**Request**: `{ reason: string }`
**Response 200**

---

## 予約変更

### EP-C006: POST /api/v1/bookings/{id}/change-requests
**機能**: FR-23 変更申請
**認証**: user (nurse 自分 or facility_admin 自施設)
**Request**: `{ change_payload: {...}, reason?: string }`
**Response 201**: 相手側承認待ち

### EP-C007: GET /api/v1/bookings/{id}/change-requests
### EP-C008: POST /api/v1/bookings/{id}/change-requests/{cid}/approve
### EP-C009: POST /api/v1/bookings/{id}/change-requests/{cid}/reject

---

## 予約キャンセル

### EP-C010: POST /api/v1/bookings/{id}/cancel
**機能**: FR-24
**認証**: user (nurse 自分 / facility_admin 自施設 / ops)
**Request**: `{ reason: string }`
**Response 200**: `{ "data": { "status": "cancelled", "refund_amount": 5000 } }`
**副作用**: ポリシー判定 + 自動返金 (FR-40) + 連動利用客予約キャンセル

---

## 予約一覧・詳細

### EP-C011: GET /api/v1/bookings (看護師)
**機能**: FR-25
**認証**: user
**Query**: `status?, from?, to?, keyword?, sort?, cursor?, limit?`
**Response 200**: 自分の予約一覧

### EP-C012: GET /api/v1/facilities/{id}/bookings
**機能**: FR-26 施設の予約一覧
**認証**: facility_admin (自施設) or org_admin (自法人配下)

### EP-C013: GET /api/v1/bookings/{id}
**機能**: FR-27 予約詳細
**認証**: user (関係者) or ops
**Response 200**: 関係者ごとに権限内の情報（PII マスキング適用）

---

## 予約セッション

### EP-C014: GET /api/v1/bookings/{id}/sessions
**機能**: FR-88 セッション一覧

### EP-C015: POST /api/v1/bookings/{id}/sessions
**機能**: FR-88 セッション追加（変更申請として）
**Request**: type, start_at, end_at, menu_items
**Errors**: 422 `SESSION_INTERVAL_TOO_SHORT`

### EP-C016: PUT /api/v1/bookings/{id}/sessions/{sid}
### EP-C017: DELETE /api/v1/bookings/{id}/sessions/{sid}

### EP-C018: POST /api/v1/bookings/{id}/sessions/{sid}/start
**機能**: FR-88 セッション開始
**認証**: user (担当看護師)
**Errors**: 422 `PRESCRIPTION_REQUIRED` — treatment セッションで指示書未発行

### EP-C019: POST /api/v1/bookings/{id}/sessions/{sid}/complete
**機能**: FR-88 セッション完了
**副作用**: 次セッション活性化

### EP-C020: POST /api/v1/bookings/{id}/sessions/{sid}/skip
**機能**: FR-88 スキップ（カウンセリング後の施術中止等）
**Request**: `{ reason: string }`

---

## FR 対応表

| FR | EP |
|---|---|
| FR-19 | EP-C001 |
| FR-20 | EP-C002 |
| FR-21 | EP-C003 |
| FR-22 | EP-C004, EP-C005 |
| FR-23 | EP-C006〜EP-C009 |
| FR-24 | EP-C010 |
| FR-25 | EP-C011 |
| FR-26 | EP-C012 |
| FR-27 | EP-C013 |
| FR-88 | EP-C014〜EP-C020 |

---

[← 04_endpoints_B_法人施設スペース.md](04_endpoints_B_法人施設スペース.md) | [次: 06_endpoints_D_指示書記録.md →](06_endpoints_D_指示書記録.md)
