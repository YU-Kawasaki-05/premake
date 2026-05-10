# API 仕様 — A. 認証・本人確認

> [00_index.md](00_index.md) に戻る

## サインアップ

### EP-A001: POST /api/v1/auth/signup/nurse
**機能**: FR-01 看護師サインアップ
**認証**: 不要
**実装**: Route Handler

**Request**:
| field | type | 必須 | 制約 |
|---|---|---|---|
| email | string | ○ | RFC5322, 255 chars |
| password | string | ○ | 12+ chars, 大小英数記号混在 |
| name | string | ○ | 1-50 chars |
| name_kana | string | ○ | 全角カナ |
| phone | string | ○ | E.164 |
| agreed_to_terms | boolean | ○ | true 必須 |

**Response 201**:
```json
{ "data": { "user_id": "uuid", "status": "email_unverified" } }
```

**副作用**:
- Supabase Auth に user 作成
- `users` に `role=nurse, status=email_unverified` で INSERT
- 確認メール送信ジョブ投入

**Errors**:
- 400 `VALIDATION_ERROR` — バリデーション失敗
- 409 `CONFLICT` — メール重複
- 429 `RATE_LIMITED` — IP 単位 5 req/h 超過

---

### EP-A002: POST /api/v1/auth/signup/oauth/google
**機能**: FR-81 Google OAuth サインアップ・ログイン
**認証**: 不要
**実装**: Route Handler（Supabase OAuth リダイレクト）

**Request** (callback):
| field | type | 必須 |
|---|---|---|
| code | string | ○ Google OAuth 認可コード |
| invitation_token | string | × 招待併用時 |

**Response 200**:
```json
{ "data": { "user_id": "uuid", "is_new_user": true } }
```

**副作用**:
- 既存 google_sub なら sign-in、無ければ users.role を判定して作成
- 招待トークン併用時は invitations.consumed
- ドメイン制限（ops 用、DEC-17）を環境変数 `OPS_OAUTH_ALLOWED_DOMAINS` で適用

**Errors**:
- 403 `FORBIDDEN` — 運営ドメイン制限違反
- 400 `INVITATION_REQUIRED` — facility_admin/doctor/org_admin で招待トークン無し

---

### EP-A003: POST /api/v1/auth/invitations/{token}/accept
**機能**: FR-02 / FR-03 / FR-84 招待型サインアップ
**認証**: 不要
**実装**: Route Handler

**Request**:
| field | type | 必須 |
|---|---|---|
| password | string | ○ |
| name, name_kana, phone | string | ○ |
| agreed_to_terms | boolean | ○ |
| medical_registration_number | string | doctor 時必須 |
| specialties | string[] | doctor 時必須 |

**Response 201**:
```json
{ "data": { "user_id": "uuid", "role": "doctor", "facility_id": "uuid" } }
```

**副作用**:
- invitations.status=consumed
- users 作成 (status=email_verified, license_status=pending_review)
- 招待元 (inviter) に通知

**Errors**:
- 410 `INVITATION_EXPIRED` — 72h 経過
- 409 `INVITATION_CONSUMED` — 既に使用済み
- 422 `EMAIL_MISMATCH` — 招待時メールと不一致

---

### EP-A004: POST /api/v1/auth/applications
**機能**: FR-02 申請型サインアップ
**認証**: 不要
**実装**: Route Handler

**Request**:
| field | type | 必須 |
|---|---|---|
| application_type | enum | ○ "facility" / "organization" |
| email, name, phone | string | ○ |
| facility_or_org_payload | object | ○ FR-02 / FR-82 の項目 |
| reason | string | ○ 50-1000 chars |

**Response 201**: `{ "data": { "application_id": "uuid", "status": "pending_review" } }`

**副作用**:
- `applications` に INSERT
- 運営に通知メール

---

## ログイン・セッション

### EP-A005: POST /api/v1/auth/login
**機能**: FR-04 ログイン
**認証**: 不要
**実装**: Route Handler

**Request**:
| field | type | 必須 |
|---|---|---|
| email, password | string | ○ |
| remember_me | boolean | × |

**Response 200**:
```json
{ "data": { "user_id": "uuid", "role": "nurse", "mfa_required": false } }
```
- Set-Cookie: sb-access-token, sb-refresh-token

**MFA 必要時 Response 200** (一時セッション):
```json
{ "data": { "mfa_required": true, "factors": ["totp"] } }
```

**Errors**:
- 401 `UNAUTHORIZED` — メール存在の有無を漏らさない統一エラー
- 423 `ACCOUNT_LOCKED` — 5 回失敗で 15 分ロック
- 403 `ACCOUNT_SUSPENDED`
- 429 `RATE_LIMITED`

---

### EP-A006: POST /api/v1/auth/mfa/verify
**機能**: FR-07 MFA 検証（ログイン時）
**認証**: 一時セッション
**Request**: `{ code: string, factor_id: string }`
**Response 200**: 通常セッション発行
**Errors**: 401 `MFA_INVALID_CODE`, 5 回失敗で一時セッション破棄

---

### EP-A007: POST /api/v1/auth/logout
**機能**: FR-12 ログアウト
**認証**: user
**Request**: `{ scope: "current" | "all_devices" | "specific", session_id?: string }`
**Response 204**: Cookie クリア

---

### EP-A008: GET /api/v1/auth/sessions
**機能**: FR-12 セッション一覧
**認証**: user
**Response 200**:
```json
{ "data": [
  { "id": "uuid", "device_label": "Chrome on macOS", "ip": "...", "last_active_at": "...", "is_current": true }
]}
```

---

### EP-A009: DELETE /api/v1/auth/sessions/{id}
**機能**: FR-12 個別セッション破棄
**認証**: user
**Response 204**

---

## パスワード・メール

### EP-A010: POST /api/v1/auth/password-reset/request
**機能**: FR-05
**認証**: 不要
**Request**: `{ email: string }`
**Response 200**: 常に成功扱い（メール存在を漏らさない）
**副作用**: 該当ユーザーがいればリセットメール送信

### EP-A011: POST /api/v1/auth/password-reset/confirm
**機能**: FR-05
**認証**: 不要
**Request**: `{ token: string, new_password: string, new_password_confirm: string }`
**Response 200**: パスワード更新 + 全セッション無効化
**Errors**: 410 `RESET_TOKEN_EXPIRED`, 409 `RESET_TOKEN_USED`

### EP-A012: POST /api/v1/auth/email/verify
**機能**: FR-06
**認証**: 不要
**Request**: `{ token: string }`
**Response 200**: users.email_verified=true
**Errors**: 410 `VERIFICATION_TOKEN_EXPIRED`

### EP-A013: POST /api/v1/auth/email/verify/resend
**機能**: FR-06 再送
**認証**: user (email_unverified)
**Response 200**: 再送ジョブ投入
**Errors**: 429（1h あたり 3 通超過）

---

## MFA 設定

### EP-A014: POST /api/v1/auth/mfa/setup
**機能**: FR-07
**認証**: user
**Request**: `{ method: "totp" | "sms", phone?: string }`
**Response 200**:
```json
{ "data": { "factor_id": "uuid", "qr_code": "data:image/png;base64,...", "secret": "..." } }
```

### EP-A015: POST /api/v1/auth/mfa/setup/verify
**機能**: FR-07 セットアップ完了
**認証**: user
**Request**: `{ factor_id: string, code: string }`
**Response 201**: `{ "data": { "backup_codes": ["10 codes"] } }`（一度のみ表示）

### EP-A016: DELETE /api/v1/auth/mfa
**機能**: FR-07 MFA 無効化
**認証**: user (aal2)
**Request**: `{ password: string }` (再入力)
**Response 200**: 確認メール送信、メール内リンクで完全無効化
**Errors**: 401 `PASSWORD_MISMATCH`

### EP-A017: POST /api/v1/auth/mfa/backup-codes/regenerate
**機能**: FR-07
**認証**: user (aal2)
**Response 200**: 新規 10 コード発行（旧コード全失効）

---

## 免許審査申請

### EP-A018: POST /api/v1/auth/licenses/nurse
**機能**: FR-08 看護師免許申請
**認証**: user (role=nurse, license_status IS NULL or rejected)
**Request** (multipart/form-data):
| field | type | 必須 |
|---|---|---|
| license_image_front | file | ○ |
| license_image_back | file | × |
| selfie_with_license | file | ○ |
| nurse_registration_number | string | ○ |
| nurse_registration_date | date | ○ |
| registered_prefecture | string | ○ |

**Response 201**: `{ "data": { "application_id": "uuid", "status": "pending_review" } }`

**副作用**:
- Storage `licenses/` に画像保存（暗号化）
- `nurse_license_applications` に INSERT
- `users.license_status=pending_review`
- 運営に通知

---

### EP-A019: POST /api/v1/auth/licenses/doctor
**機能**: FR-10
**認証**: user (role=doctor, license_status IS NULL or rejected)
**Request**: 看護師と同形式 + medical_registration_number, medical_registration_date, specialty_certificates (file, 任意)

---

### EP-A020: POST /api/v1/auth/licenses/facility
**機能**: FR-09
**認証**: user (role=facility_admin)
**Request** (multipart):
- license_image (file), license_number, license_issued_at, public_health_office, applicant_id_image (file), applicant_selfie (file), organization_id (任意)

---

### EP-A021: POST /api/v1/auth/licenses/organization
**機能**: FR-82
**認証**: user (role=org_admin)
**Request**: registration_certificate (file), 法人プロフィール一式 (corporate_number, founded_at, etc.)

---

## 招待発行・管理

### EP-A022: POST /api/v1/invitations
**機能**: FR-02 / FR-03 / FR-84 招待発行
**認証**: user (role IN [facility_admin, ops, org_admin])
**Request**:
```json
{
  "invitee_email": "...",
  "invitee_role": "facility_admin" | "doctor" | "org_admin",
  "facility_id": "uuid",         // facility_admin / doctor 時
  "organization_id": "uuid",     // org_admin 時
  "method": "link" | "code",
  "expires_in_hours": 72
}
```
**Response 201**:
```json
{ "data": { "invitation_id": "uuid", "token": "...", "code": "ABC12345", "url": "https://..." } }
```

**副作用**:
- `invitations` INSERT
- method=link なら招待メール送信

---

### EP-A023: GET /api/v1/invitations
**機能**: 招待一覧（自分が発行 / 自施設・自法人宛）
**認証**: user
**Query**: `status=active|consumed|revoked`
**Response 200**: 一覧

---

### EP-A024: DELETE /api/v1/invitations/{id}
**機能**: FR-84 招待取消
**認証**: user (発行者のみ or ops)
**Response 204**

---

### EP-A025: POST /api/v1/auth/account/suspend (ops)
**機能**: FR-11 凍結
**認証**: ops (aal2)
**Request**: `{ user_id, action: "suspend"|"unsuspend", reason: string, ongoing_bookings: "cancel_all"|"keep_ongoing"|"review_each" }`
**Response 200**: `{ "data": { "user_id": "uuid", "status": "suspended" } }`
**副作用**: users.status 更新、全セッション無効化、進行中予約処理キック、通知メール

---

## FR 対応表

| FR | 主要 EP |
|---|---|
| FR-01 | EP-A001 |
| FR-02 | EP-A003, EP-A004, EP-A022 |
| FR-03 | EP-A003, EP-A019, EP-A022 |
| FR-04 | EP-A005 |
| FR-05 | EP-A010, EP-A011 |
| FR-06 | EP-A012, EP-A013 |
| FR-07 | EP-A006, EP-A014, EP-A015, EP-A016, EP-A017 |
| FR-08 | EP-A018 |
| FR-09 | EP-A020 |
| FR-10 | EP-A019 |
| FR-11 | EP-A025 |
| FR-12 | EP-A007, EP-A008, EP-A009 |
| FR-81 | EP-A002 |
| FR-82 | EP-A021 |
| FR-84 | EP-A022, EP-A023, EP-A024 |
| FR-87 | EP-H012（運営章） |

---

[← 02_認証共通.md](02_認証共通.md) | [次: 04_endpoints_B_法人施設スペース.md →](04_endpoints_B_法人施設スペース.md)
