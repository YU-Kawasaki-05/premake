# API 仕様 — J. ダッシュボード

> [00_index.md](00_index.md) に戻る

> ダッシュボードは画面ロード時に **集約 GET エンドポイント** で必要データを 1 回取得（NFR-PERF）。

### EP-J001: GET /api/v1/dashboard/nurse
**機能**: FR-65 看護師ダッシュボード
**認証**: user (nurse)
**Response 200**:
```json
{ "data": {
  "tasks": { "prescriptions_pending_count": 0, "records_pending_count": 2, "approvals_waiting": 1 },
  "today_bookings": [...],
  "this_week_bookings": [...],
  "revenue_summary": { "this_month_gmv": 200000, "this_month_net": 170000, "is_finalized": false },
  "monthly_revenue_chart": [...],
  "public_page_url": "https://premake.example.com/n/yamada-nurse",
  "notifications_unread": 5,
  "banners": [{ "type": "license_pending", "message": "..." }]
}}
```

### EP-J002: GET /api/v1/dashboard/facility
**機能**: FR-66
**Query**: `facility_id`
**Response 200**:
- approvals_pending（承認待ち）
- recent_bookings
- occupancy_rate_chart（スペース別月次稼働率）
- revenue_summary
- payouts_upcoming
- doctor_status[]
- banners

### EP-J003: GET /api/v1/dashboard/doctor
**機能**: FR-67
**Response 200**:
- prescriptions_pending（緊急度ソート）
- records_pending（SLA 警告含む）
- today_bookings
- this_week_bookings
- anomaly_records[]

### EP-J004: GET /api/v1/dashboard/ops
**機能**: FR-68
**認証**: ops
**Response 200**:
- KPI: gmv_today / gmv_this_month / fee_revenue / active_nurses / active_facilities / booking_completion_rate / cancel_rate / avg_unit_price / repeat_rate
- review_queue / violation_count / stripe_alerts / system_health
- monthly_charts
- region_heatmap
- facility_ranking[]

### EP-J005: GET /api/v1/dashboard/org
**機能**: FR-85
**認証**: org_admin
**Query**: `organization_id`
**Response 200**:
- aggregated_kpi
- facility_ranking
- facility_status_cards[]
- benchmark
- invitation_pending_count

---

## FR 対応表

| FR | EP |
|---|---|
| FR-65 | EP-J001 |
| FR-66 | EP-J002 |
| FR-67 | EP-J003 |
| FR-68 | EP-J004 |
| FR-85 | EP-J005 |

---

[← 11_endpoints_I_公開.md](11_endpoints_I_公開.md) | [次: 13_endpoints_K_顧客予約.md →](13_endpoints_K_顧客予約.md)
