# API 仕様 — B. 法人・施設・スペース

> [00_index.md](00_index.md) に戻る

## 法人 (Organization)

### EP-B001: POST /api/v1/organizations
**機能**: FR-82 法人登録
**認証**: user (org_admin)
**Request**: name, legal_form, corporate_number, founded_at, representative_*, address, phone, email, website
**Response 201**: `{ "data": { "id": "uuid", "status": "pending_review" } }`

### EP-B002: GET /api/v1/organizations/{id}
**認証**: user (自法人 or ops)
**Response 200**: 法人詳細

### EP-B003: PUT /api/v1/organizations/{id}
**機能**: FR-82 編集
**認証**: org_admin (自法人) or ops
**Errors**: 重要項目変更時は status=pending_re_review に戻る

---

## 施設 (Facility)

### EP-B004: POST /api/v1/facilities
**機能**: FR-83 / FR-13 配下施設追加
**認証**: org_admin (自法人) or 直接申請の場合は EP-A020
**Request**: facility プロフィール一式 + organization_id（自法人）
**Response 201**

### EP-B005: GET /api/v1/facilities
**機能**: 施設一覧
**認証**: user
**Query**: `organization_id?, status?, search?`
**Response 200**: 一覧（権限に応じてフィルタ）

### EP-B006: GET /api/v1/facilities/{id}
**機能**: FR-13 詳細閲覧
**認証**: user
**Response 200**: 詳細（権限内のフィールドのみ）

### EP-B007: PUT /api/v1/facilities/{id}
**機能**: FR-13 編集
**認証**: facility_admin (自施設) or org_admin (自法人) or ops
**副作用**: 重要項目変更時 pending_re_review

### EP-B008: POST /api/v1/facilities/{id}/close
**機能**: FR-83 閉鎖
**認証**: org_admin or ops
**Request**: `{ reason, effective_at, ongoing_bookings: "honor_until" | "cancel_all_with_refund" }`
**Response 200**: 閉鎖予約完了
**副作用**: 既予約処理（cancel_all_with_refund 選択時は FR-40 へ）

---

## スペース (Space)

### EP-B009: POST /api/v1/facilities/{id}/spaces
**機能**: FR-14 スペース登録
**認証**: facility_admin (自施設) or org_admin
**Request**:
```json
{
  "name": "...", "room_type": "...", "area_sqm": 12.5,
  "equipments": ["拡大鏡", "Wi-Fi"], "amenities_text": "...",
  "usage_rules": "...", "concurrent_capacity": 1,
  "earliest_entry_time": "09:00", "latest_exit_time": "21:00"
}
```
**Response 201**: `{ "data": { "id": "uuid", "status": "draft" } }`
**Errors**: 422 `FACILITY_NOT_APPROVED`

### EP-B010: PUT /api/v1/spaces/{id}
**機能**: FR-14 編集
**認証**: facility_admin or org_admin

### EP-B011: DELETE /api/v1/spaces/{id}
**機能**: FR-14 ソフトデリート
**認証**: facility_admin or org_admin
**Response 204**

### EP-B012: POST /api/v1/spaces/{id}/images
**機能**: FR-14 画像アップロード
**認証**: facility_admin
**Request** (multipart): files[]
**Response 201**: `{ "data": { "image_ids": ["uuid", ...] } }`

### EP-B013: DELETE /api/v1/spaces/{id}/images/{image_id}

---

## スペース料金

### EP-B014: GET /api/v1/spaces/{id}/pricing
**機能**: FR-15 現行料金取得
**認証**: 公開（誰でも閲覧可）

### EP-B015: PUT /api/v1/spaces/{id}/pricing
**機能**: FR-15 料金更新
**認証**: facility_admin or org_admin
**Request**: base_price, billing_unit, min_duration_min, time_window_multipliers, weekday_multipliers, advance_discount_pct, consecutive_discount_pct
**副作用**: 既存 row の effective_to をセット、新規 row INSERT（履歴保持）

---

## 空き枠カレンダー

### EP-B016: GET /api/v1/spaces/{id}/availability
**機能**: FR-16 / FR-19 空き枠取得
**認証**: 公開
**Query**: `from=YYYY-MM-DD&to=YYYY-MM-DD&duration_min=60`
**Response 200**: 利用可能スロット一覧（ルール + override + 既予約 + 競合差分の結果）

### EP-B017: POST /api/v1/spaces/{id}/availability/rules
**機能**: FR-16 営業ルール追加
**認証**: facility_admin
**Request**: weekdays, start_time, end_time, valid_from, valid_to

### EP-B018: PUT /api/v1/spaces/{id}/availability/rules/{rule_id}
### EP-B019: DELETE /api/v1/spaces/{id}/availability/rules/{rule_id}

### EP-B020: POST /api/v1/spaces/{id}/availability/overrides
**機能**: FR-16 個別ブロック / オープン
**認証**: facility_admin
**Request**: override_type ('block'/'open'), start_at, end_at, reason
**Errors**: 422 `BOOKING_CONFLICT` — 既予約とぶつかる

### EP-B021: DELETE /api/v1/spaces/{id}/availability/overrides/{id}

---

## 公開・非公開

### EP-B022: POST /api/v1/spaces/{id}/publish
**機能**: FR-17 公開
**認証**: facility_admin or org_admin
**Response 200**: 公開条件未達なら 422 `PUBLISH_REQUIREMENTS_NOT_MET` + 不足項目リスト

### EP-B023: POST /api/v1/spaces/{id}/unpublish

---

## 指示医割当

### EP-B024: GET /api/v1/facilities/{id}/doctor-assignments
**機能**: FR-18
**認証**: facility_admin or org_admin

### EP-B025: POST /api/v1/facilities/{id}/doctor-assignments
**機能**: FR-18 指示医割当
**Request**: `{ doctor_user_id, is_default_doctor, target_space_ids?, target_time_window? }`
**Errors**: 422 `DOCTOR_NOT_APPROVED`

### EP-B026: PUT /api/v1/facilities/{id}/doctor-assignments/{aid}
### EP-B027: DELETE /api/v1/facilities/{id}/doctor-assignments/{aid}

---

## Stripe Connect

### EP-B028: POST /api/v1/facilities/{id}/stripe-connect/initiate
**機能**: FR-37 連携開始
**認証**: facility_admin or org_admin
**Response 200**: `{ "data": { "onboarding_url": "https://connect.stripe.com/..." } }`

### EP-B029: GET /api/v1/facilities/{id}/stripe-connect/status
**機能**: FR-37 連携状態
**Response 200**: `{ "data": { "account_id": "...", "payouts_enabled": true, "requirements": [] } }`

### EP-B030: DELETE /api/v1/facilities/{id}/stripe-connect
**機能**: FR-37 連携解除（disconnect_pending）
**Response 200**

---

### EP-B031: POST /api/v1/organizations/{id}/stripe-connect/initiate
**機能**: FR-37 法人レベル連携
**認証**: org_admin

---

## キャンセルポリシー上書き

### EP-B032: GET /api/v1/facilities/{id}/cancel-policy-override
**機能**: FR-86 取得
**認証**: 公開（看護師が予約申込時に確認）

### EP-B033: PUT /api/v1/facilities/{id}/cancel-policy-override
**機能**: FR-86 設定
**認証**: facility_admin or org_admin
**Request**: policy 配列
**Errors**: 422 `POLICY_NOT_RELAXED` — 共通ポリシーより厳格化を試みた

---

## FR 対応表

| FR | EP |
|---|---|
| FR-13 | EP-B006, EP-B007 |
| FR-14 | EP-B009, EP-B010, EP-B011, EP-B012, EP-B013 |
| FR-15 | EP-B014, EP-B015 |
| FR-16 | EP-B016, EP-B017〜B021 |
| FR-17 | EP-B022, EP-B023 |
| FR-18 | EP-B024〜B027 |
| FR-37 | EP-B028〜B031 |
| FR-82 | EP-B001, EP-B002, EP-B003 |
| FR-83 | EP-B004, EP-B005, EP-B008 |
| FR-86 | EP-B032, EP-B033 |

---

[← 03_endpoints_A_認証.md](03_endpoints_A_認証.md) | [次: 05_endpoints_C_予約.md →](05_endpoints_C_予約.md)
