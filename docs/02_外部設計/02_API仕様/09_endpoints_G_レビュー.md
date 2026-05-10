# API 仕様 — G. レビュー（β）

> [00_index.md](00_index.md) に戻る

### EP-G001: GET /api/v1/reviews
**機能**: FR-51 一覧
**認証**: 公開（公開設定の review のみ）
**Query**: `target_type=space|facility|nurse&target_id=...&star_min&from&to&sort=&cursor=`
**Response 200**: 一覧（投稿者は匿名化）+ 評価分布サマリ

### EP-G002: POST /api/v1/reviews
**機能**: FR-49 / FR-50 投稿
**認証**: user (nurse → facility/space, facility_admin → nurse)
**Request**:
```json
{
  "booking_id": "uuid",
  "target_type": "space",
  "target_id": "uuid",
  "star_rating": 5,
  "category_ratings": { "clean": 5, "equipment": 4, "access": 5, "staff": 5 },
  "comment": "...",
  "visibility": "public"
}
```
**Response 201**
**Errors**: 409 `ALREADY_REVIEWED`, 422 `BOOKING_NOT_COMPLETED`, 422 `EDIT_WINDOW_CLOSED`

### EP-G003: PUT /api/v1/reviews/{id}
**機能**: FR-49 編集（7 日以内）
**Errors**: 410 `EDIT_EXPIRED`

### EP-G004: DELETE /api/v1/reviews/{id}
**機能**: 自分のレビュー削除
**Response 204**

### EP-G005: POST /api/v1/reviews/{id}/report
**機能**: FR-52 通報
**認証**: user
**Request**: `{ reason: string, detail?: string }`
**Response 201**: review は審査中表示に切り替わり、運営対応待ち
**Errors**: 429 `REPORT_RATE_LIMITED` — 同一ユーザー 5 件/日 超過

### EP-G006: POST /api/v1/ops/reviews/{id}/moderate
**機能**: FR-52 モデレーション
**認証**: ops
**Request**: `{ action: "keep" | "hide" | "remove" | "warn_author", reason: string }`
**Response 200**

---

## FR 対応表

| FR | EP |
|---|---|
| FR-49 | EP-G002, EP-G003 |
| FR-50 | EP-G002 |
| FR-51 | EP-G001 |
| FR-52 | EP-G005, EP-G006 |

---

[← 08_endpoints_F_通知.md](08_endpoints_F_通知.md) | [次: 10_endpoints_H_運営.md →](10_endpoints_H_運営.md)
