# API 仕様 — 全エンドポイント一覧（クイックリファレンス）

> [00_index.md](00_index.md) に戻る

| EP-ID | Method | Path | 認証 | 関連 FR | 実装 |
|---|---|---|---|---|---|
| EP-A001 | POST | /api/v1/auth/signup/nurse | none | FR-01 | Route Handler |
| EP-A002 | POST | /api/v1/auth/signup/oauth/google | none | FR-81 | Route Handler |
| EP-A003 | POST | /api/v1/auth/invitations/{token}/accept | none | FR-02, FR-03, FR-84 | Route Handler |
| EP-A004 | POST | /api/v1/auth/applications | none | FR-02 | Route Handler |
| EP-A005 | POST | /api/v1/auth/login | none | FR-04 | Route Handler |
| EP-A006 | POST | /api/v1/auth/mfa/verify | tmp | FR-07 | Route Handler |
| EP-A007 | POST | /api/v1/auth/logout | user | FR-12 | Server Action |
| EP-A008 | GET | /api/v1/auth/sessions | user | FR-12 | Server Action |
| EP-A009 | DELETE | /api/v1/auth/sessions/{id} | user | FR-12 | Server Action |
| EP-A010 | POST | /api/v1/auth/password-reset/request | none | FR-05 | Route Handler |
| EP-A011 | POST | /api/v1/auth/password-reset/confirm | none | FR-05 | Route Handler |
| EP-A012 | POST | /api/v1/auth/email/verify | none | FR-06 | Route Handler |
| EP-A013 | POST | /api/v1/auth/email/verify/resend | user | FR-06 | Server Action |
| EP-A014 | POST | /api/v1/auth/mfa/setup | user | FR-07 | Server Action |
| EP-A015 | POST | /api/v1/auth/mfa/setup/verify | user | FR-07 | Server Action |
| EP-A016 | DELETE | /api/v1/auth/mfa | aal2 | FR-07 | Server Action |
| EP-A017 | POST | /api/v1/auth/mfa/backup-codes/regenerate | aal2 | FR-07 | Server Action |
| EP-A018 | POST | /api/v1/auth/licenses/nurse | user(nurse) | FR-08 | Route Handler |
| EP-A019 | POST | /api/v1/auth/licenses/doctor | user(doctor) | FR-10 | Route Handler |
| EP-A020 | POST | /api/v1/auth/licenses/facility | user(fac_adm) | FR-09 | Route Handler |
| EP-A021 | POST | /api/v1/auth/licenses/organization | user(org_adm) | FR-82 | Route Handler |
| EP-A022 | POST | /api/v1/invitations | user | FR-02, FR-84 | Server Action |
| EP-A023 | GET | /api/v1/invitations | user | FR-02 | Server Action |
| EP-A024 | DELETE | /api/v1/invitations/{id} | user | FR-84 | Server Action |
| EP-A025 | POST | /api/v1/auth/account/suspend | ops aal2 | FR-11 | Server Action |
| EP-B001 | POST | /api/v1/organizations | org_adm | FR-82 | Server Action |
| EP-B002 | GET | /api/v1/organizations/{id} | user | FR-82 | Server Action |
| EP-B003 | PUT | /api/v1/organizations/{id} | org_adm | FR-82 | Server Action |
| EP-B004 | POST | /api/v1/facilities | org_adm | FR-83 | Server Action |
| EP-B005 | GET | /api/v1/facilities | user | FR-83 | Server Action |
| EP-B006 | GET | /api/v1/facilities/{id} | user | FR-13 | Server Action |
| EP-B007 | PUT | /api/v1/facilities/{id} | fac_adm | FR-13 | Server Action |
| EP-B008 | POST | /api/v1/facilities/{id}/close | org_adm | FR-83 | Server Action |
| EP-B009 | POST | /api/v1/facilities/{id}/spaces | fac_adm | FR-14 | Server Action |
| EP-B010 | PUT | /api/v1/spaces/{id} | fac_adm | FR-14 | Server Action |
| EP-B011 | DELETE | /api/v1/spaces/{id} | fac_adm | FR-14 | Server Action |
| EP-B012 | POST | /api/v1/spaces/{id}/images | fac_adm | FR-14 | Route Handler |
| EP-B013 | DELETE | /api/v1/spaces/{id}/images/{img_id} | fac_adm | FR-14 | Server Action |
| EP-B014 | GET | /api/v1/spaces/{id}/pricing | public | FR-15 | Route Handler |
| EP-B015 | PUT | /api/v1/spaces/{id}/pricing | fac_adm | FR-15 | Server Action |
| EP-B016 | GET | /api/v1/spaces/{id}/availability | public | FR-16, FR-19 | Route Handler |
| EP-B017 | POST | /api/v1/spaces/{id}/availability/rules | fac_adm | FR-16 | Server Action |
| EP-B018 | PUT | /api/v1/spaces/{id}/availability/rules/{rid} | fac_adm | FR-16 | Server Action |
| EP-B019 | DELETE | /api/v1/spaces/{id}/availability/rules/{rid} | fac_adm | FR-16 | Server Action |
| EP-B020 | POST | /api/v1/spaces/{id}/availability/overrides | fac_adm | FR-16 | Server Action |
| EP-B021 | DELETE | /api/v1/spaces/{id}/availability/overrides/{oid} | fac_adm | FR-16 | Server Action |
| EP-B022 | POST | /api/v1/spaces/{id}/publish | fac_adm | FR-17 | Server Action |
| EP-B023 | POST | /api/v1/spaces/{id}/unpublish | fac_adm | FR-17 | Server Action |
| EP-B024 | GET | /api/v1/facilities/{id}/doctor-assignments | fac_adm | FR-18 | Server Action |
| EP-B025 | POST | /api/v1/facilities/{id}/doctor-assignments | fac_adm | FR-18 | Server Action |
| EP-B026 | PUT | /api/v1/facilities/{id}/doctor-assignments/{aid} | fac_adm | FR-18 | Server Action |
| EP-B027 | DELETE | /api/v1/facilities/{id}/doctor-assignments/{aid} | fac_adm | FR-18 | Server Action |
| EP-B028 | POST | /api/v1/facilities/{id}/stripe-connect/initiate | fac_adm | FR-37 | Server Action |
| EP-B029 | GET | /api/v1/facilities/{id}/stripe-connect/status | fac_adm | FR-37 | Server Action |
| EP-B030 | DELETE | /api/v1/facilities/{id}/stripe-connect | fac_adm | FR-37 | Server Action |
| EP-B031 | POST | /api/v1/organizations/{id}/stripe-connect/initiate | org_adm | FR-37 | Server Action |
| EP-B032 | GET | /api/v1/facilities/{id}/cancel-policy-override | public | FR-86 | Route Handler |
| EP-B033 | PUT | /api/v1/facilities/{id}/cancel-policy-override | fac_adm | FR-86 | Server Action |
| EP-C001 | GET | /api/v1/spaces/search | nurse | FR-19 | Server Action |
| EP-C002 | GET | /api/v1/spaces/{id} | user | FR-20 | Server Action |
| EP-C003 | POST | /api/v1/bookings | nurse | FR-21 | Server Action |
| EP-C004 | POST | /api/v1/bookings/{id}/approve | fac_adm | FR-22 | Server Action |
| EP-C005 | POST | /api/v1/bookings/{id}/reject | fac_adm | FR-22 | Server Action |
| EP-C006 | POST | /api/v1/bookings/{id}/change-requests | user | FR-23 | Server Action |
| EP-C007 | GET | /api/v1/bookings/{id}/change-requests | user | FR-23 | Server Action |
| EP-C008 | POST | /api/v1/bookings/{id}/change-requests/{cid}/approve | user | FR-23 | Server Action |
| EP-C009 | POST | /api/v1/bookings/{id}/change-requests/{cid}/reject | user | FR-23 | Server Action |
| EP-C010 | POST | /api/v1/bookings/{id}/cancel | user/ops | FR-24 | Server Action |
| EP-C011 | GET | /api/v1/bookings | nurse | FR-25 | Server Action |
| EP-C012 | GET | /api/v1/facilities/{id}/bookings | fac_adm | FR-26 | Server Action |
| EP-C013 | GET | /api/v1/bookings/{id} | user | FR-27 | Server Action |
| EP-C014 | GET | /api/v1/bookings/{id}/sessions | user | FR-88 | Server Action |
| EP-C015 | POST | /api/v1/bookings/{id}/sessions | user | FR-88 | Server Action |
| EP-C016 | PUT | /api/v1/bookings/{id}/sessions/{sid} | user | FR-88 | Server Action |
| EP-C017 | DELETE | /api/v1/bookings/{id}/sessions/{sid} | user | FR-88 | Server Action |
| EP-C018 | POST | /api/v1/bookings/{id}/sessions/{sid}/start | nurse | FR-88 | Server Action |
| EP-C019 | POST | /api/v1/bookings/{id}/sessions/{sid}/complete | nurse | FR-88 | Server Action |
| EP-C020 | POST | /api/v1/bookings/{id}/sessions/{sid}/skip | nurse | FR-88 | Server Action |
| EP-D001 | GET | /api/v1/prescriptions | doctor/fac_adm | FR-29 | Server Action |
| EP-D002 | GET | /api/v1/prescriptions/{id} | user | FR-29 | Server Action |
| EP-D003 | POST | /api/v1/prescriptions | doctor aal2 | FR-29 | Server Action |
| EP-D004 | POST | /api/v1/prescriptions/{id}/revoke | doctor aal2 | FR-29 | Server Action |
| EP-D005 | GET | /api/v1/prescriptions/{id}/pdf | user | FR-30 | Route Handler |
| EP-D006 | GET | /verify/prescription/{id} | public | FR-30 | Route Handler |
| EP-D007 | GET | /api/v1/consent-templates | user | FR-31 | Server Action |
| EP-D008 | POST | /api/v1/consent-templates | user | FR-31 | Server Action |
| EP-D009 | PUT | /api/v1/consent-templates/{id} | user | FR-31 | Server Action |
| EP-D010 | GET | /api/c/consents/{token} | guest token | FR-32 | Route Handler |
| EP-D011 | POST | /api/c/consents/{token} | guest token | FR-32 | Route Handler |
| EP-D012 | GET | /api/v1/questionnaire-templates | user | FR-71 | Server Action |
| EP-D013 | POST | /api/v1/questionnaire-templates | nurse | FR-71 | Server Action |
| EP-D014 | PUT | /api/v1/questionnaire-templates/{id} | nurse | FR-71 | Server Action |
| EP-D015 | GET | /api/c/questionnaires/{token} | guest token | FR-72 | Route Handler |
| EP-D016 | POST | /api/c/questionnaires/{token} | guest token | FR-72 | Route Handler |
| EP-D017 | GET | /api/v1/treatment-records | user | FR-35 | Server Action |
| EP-D018 | GET | /api/v1/treatment-records/{id} | user | FR-35 | Server Action |
| EP-D019 | POST | /api/v1/treatment-records | nurse | FR-33 | Server Action |
| EP-D020 | POST | /api/v1/treatment-records/{id}/images | nurse | FR-33 | Route Handler |
| EP-D021 | PUT | /api/v1/treatment-records/{id} | nurse | FR-33 | Server Action |
| EP-D022 | POST | /api/v1/treatment-records/{id}/confirm | doctor | FR-34 | Server Action |
| EP-D023 | POST | /api/v1/treatment-records/{id}/request-revision | doctor | FR-34 | Server Action |
| EP-D024 | POST | /api/v1/treatment-records/{id}/addenda | user | FR-34 | Server Action |
| EP-E001 | POST | /api/v1/payment-methods/setup-intent | nurse | FR-36 | Server Action |
| EP-E002 | POST | /api/v1/payment-methods/confirm | nurse | FR-36 | Server Action |
| EP-E003 | GET | /api/v1/payment-methods | nurse | FR-36 | Server Action |
| EP-E004 | DELETE | /api/v1/payment-methods/{id} | nurse | FR-36 | Server Action |
| EP-E005 | POST | /api/v1/payment-methods/{id}/default | nurse | FR-36 | Server Action |
| EP-E006 | POST | /api/webhooks/stripe | sig | FR-42 | Route Handler |
| EP-E007 | POST | /api/v1/payments/{id}/capture | ops | FR-38 | Server Action |
| EP-E008 | POST | /api/v1/refunds | ops | FR-40, FR-57 | Server Action |
| EP-E009 | GET | /api/v1/refunds | ops/user | FR-40 | Server Action |
| EP-E010 | POST | /api/c/payments/{token}/setup | guest | FR-39 | Route Handler |
| EP-E011 | POST | /api/c/payments/{token}/confirm | guest | FR-39 | Route Handler |
| EP-E012 | GET | /api/v1/finance/statements | user | FR-43 | Server Action |
| EP-E013 | GET | /api/v1/finance/statements/export | user | FR-43, FR-58 | Route Handler |
| EP-E014 | GET | /api/v1/facilities/{id}/payouts | fac_adm | FR-44 | Server Action |
| EP-F001 | GET | /api/v1/bookings/{id}/chat | user | FR-45 | Server Action |
| EP-F002 | POST | /api/v1/bookings/{id}/chat/messages | user | FR-45 | Server Action |
| EP-F003 | POST | /api/v1/bookings/{id}/chat/attachments | user | FR-45 | Route Handler |
| EP-F004 | POST | /api/v1/bookings/{id}/chat/messages/{mid}/read | user | FR-45 | Server Action |
| EP-F005 | GET | /api/v1/bookings/{id}/chat/stream | user | FR-45 | Route Handler (SSE) |
| EP-F006 | GET | /api/v1/notifications | user | FR-46, FR-47 | Server Action |
| EP-F007 | POST | /api/v1/notifications/{id}/read | user | FR-46 | Server Action |
| EP-F008 | POST | /api/v1/notifications/read-all | user | FR-46 | Server Action |
| EP-F009 | GET | /api/v1/notifications/unread-count | user | FR-46 | Server Action |
| EP-F010 | GET | /api/v1/notification-preferences | user | FR-48 | Server Action |
| EP-F011 | PUT | /api/v1/notification-preferences | user | FR-48 | Server Action |
| EP-G001 | GET | /api/v1/reviews | public | FR-51 | Route Handler |
| EP-G002 | POST | /api/v1/reviews | user | FR-49, FR-50 | Server Action |
| EP-G003 | PUT | /api/v1/reviews/{id} | user | FR-49 | Server Action |
| EP-G004 | DELETE | /api/v1/reviews/{id} | user | FR-49 | Server Action |
| EP-G005 | POST | /api/v1/reviews/{id}/report | user | FR-52 | Server Action |
| EP-G006 | POST | /api/v1/ops/reviews/{id}/moderate | ops | FR-52 | Server Action |
| EP-H001 | GET | /api/v1/ops/users | ops | FR-53 | Server Action |
| EP-H002 | GET | /api/v1/ops/users/{id} | ops | FR-53 | Server Action |
| EP-H003 | POST | /api/v1/ops/users/{id}/suspend | ops aal2 | FR-11 | Server Action |
| EP-H004 | POST | /api/v1/ops/users/{id}/unsuspend | ops aal2 | FR-11 | Server Action |
| EP-H005 | GET | /api/v1/ops/license-applications | ops | FR-54 | Server Action |
| EP-H006 | GET | /api/v1/ops/license-applications/{id} | ops | FR-54 | Server Action |
| EP-H007 | POST | /api/v1/ops/license-applications/{id}/approve | ops | FR-54 | Server Action |
| EP-H008 | POST | /api/v1/ops/license-applications/{id}/reject | ops | FR-54 | Server Action |
| EP-H009 | POST | /api/v1/ops/license-applications/{id}/request-info | ops | FR-54 | Server Action |
| EP-H010 | GET | /api/v1/ops/violations | ops | FR-56 | Server Action |
| EP-H011 | POST | /api/v1/ops/violations | ops | FR-56 | Server Action |
| EP-H012 | POST | /api/v1/ops/violations/{id}/resolve | ops aal2 | FR-56 | Server Action |
| EP-H013 | GET | /api/v1/ops/transactions | ops | FR-55 | Server Action |
| EP-H014 | GET | /api/v1/ops/dashboard/alerts | ops | FR-55, FR-68 | Server Action |
| EP-H015 | GET | /api/v1/ops/audit-log | ops | FR-59 | Server Action |
| EP-H016 | POST | /api/v1/ops/exports | ops | FR-58 | Server Action |
| EP-H017 | GET | /api/v1/ops/exports/{id} | ops | FR-58 | Server Action |
| EP-H018 | POST | /api/v1/ops/exports/{id}/approve | ops | FR-58 | Server Action |
| EP-H019 | POST | /api/v1/ops/managed-onboarding | ops | FR-87 | Server Action |
| EP-H020 | POST | /api/v1/ops/managed-onboarding/bulk | ops | FR-87 | Route Handler |
| EP-H021 | POST | /api/v1/ops/announcements | ops | FR-60 | Server Action |
| EP-H022 | GET | /api/v1/ops/announcements | ops | FR-60 | Server Action |
| EP-H023 | PUT | /api/v1/ops/announcements/{id} | ops | FR-60 | Server Action |
| EP-H024 | DELETE | /api/v1/ops/announcements/{id} | ops | FR-60 | Server Action |
| EP-I001 | GET | /api/v1/terms | public | FR-61 | Route Handler |
| EP-I002 | GET | /api/v1/privacy | public | FR-62 | Route Handler |
| EP-I003 | GET | /api/v1/commerce-disclosure | public | FR-63 | Route Handler |
| EP-I004 | POST | /api/v1/contact | public | FR-64 | Route Handler |
| EP-I005 | POST | /api/v1/terms/{type}/agree | user | FR-61, FR-62 | Server Action |
| EP-J001 | GET | /api/v1/dashboard/nurse | nurse | FR-65 | Server Action |
| EP-J002 | GET | /api/v1/dashboard/facility | fac_adm | FR-66 | Server Action |
| EP-J003 | GET | /api/v1/dashboard/doctor | doctor | FR-67 | Server Action |
| EP-J004 | GET | /api/v1/dashboard/ops | ops | FR-68 | Server Action |
| EP-J005 | GET | /api/v1/dashboard/org | org_adm | FR-85 | Server Action |
| EP-K001 | GET | /api/v1/nurse-pages/me | nurse | FR-69 | Server Action |
| EP-K002 | PUT | /api/v1/nurse-pages/me | nurse | FR-69 | Server Action |
| EP-K003 | GET | /api/v1/nurse-pages/handle-availability | user | FR-69 | Server Action |
| EP-K004 | GET | /api/c/n/{handle} | public | FR-69 | Route Handler |
| EP-K005 | GET | /api/c/n/{handle}/availability | public | FR-69 | Route Handler |
| EP-K006 | POST | /api/c/n/{handle}/bookings/draft | public | FR-70 | Route Handler |
| EP-K007 | POST | /api/c/bookings/{token}/verify-sms | public | FR-70, FR-47 | Route Handler |
| EP-K008 | POST | /api/c/bookings/{token}/resend-sms | public | FR-47 | Route Handler |
| EP-K009 | POST | /api/c/lookup/request-otp | public | FR-74 | Route Handler |
| EP-K010 | POST | /api/c/lookup/verify-otp | public | FR-74 | Route Handler |
| EP-K011 | GET | /api/c/bookings | guest | FR-74 | Route Handler |
| EP-K012 | GET | /api/c/bookings/{id} | guest | FR-74 | Route Handler |
| EP-K013 | POST | /api/c/bookings/{id}/modify | guest | FR-75 | Route Handler |
| EP-K014 | POST | /api/c/bookings/{id}/cancel | guest | FR-75 | Route Handler |
| EP-X001 | GET | /api/health | public | FR-80 | Route Handler |
| EP-X002 | GET | /api/v1/status | public | FR-80 | Route Handler |
| EP-X003 | GET | /api/v1/feature-flags | public | FR-79 | Route Handler |
| EP-X004 | PUT | /api/v1/ops/feature-flags/{key} | ops aal2 | FR-79 | Server Action |
| EP-X005 | GET | /api/v1/ops/feature-flags | ops | FR-79 | Server Action |
| EP-X006 | POST | /api/v1/ops/jobs/run | ops aal2 | FR-77 | Server Action |
| EP-X007 | GET | /api/v1/ops/jobs | ops | FR-77 | Server Action |

---

## サマリ

| カテゴリ | 件数 |
|---|---|
| A 認証 | 25 |
| B 法人施設スペース | 33 |
| C 予約 | 20 |
| D 指示書記録 | 24 |
| E 決済 | 14 |
| F 通知 | 11 |
| G レビュー | 6 |
| H 運営 | 24 |
| I 公開 | 5 |
| J ダッシュボード | 5 |
| K 顧客予約 | 14 |
| 横断 | 7 |
| **合計** | **188** |

---

[← 14_endpoints_横断.md](14_endpoints_横断.md) | [00_index.md に戻る](00_index.md)
