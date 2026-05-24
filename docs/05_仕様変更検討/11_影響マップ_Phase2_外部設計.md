# 影響マップ: Phase 2 外部設計 — premake 仕様変更

> [00_index.md](00_index.md) に戻る

---

## 1. 影響を受ける Phase 2 ドキュメント

| ファイル | 影響度 | 内容 |
|---|---|---|
| `02_外部設計/00_サマリー.md` | 中 | FR 網羅性表の更新 |
| `02_外部設計/01_DB設計/` | **大** | 新規テーブル + 既存テーブル改訂 |
| `02_外部設計/02_API仕様/` | **大** | 新規 EP + 既存 EP 改訂 |
| `02_外部設計/03_権限設計/` | **大** | RLS 全面再確認 |
| `02_外部設計/04_画面設計/` | 中 | 新規 SCR + 既存 SCR 改訂 |
| `02_外部設計/05_非機能要件.md` | 中 | NFR-CMPL（コンプライアンス）強化 |
| `02_外部設計/06_テスト戦略.md` | 中 | AC マッピング更新 |
| `02_外部設計/_index.yml` | 中 | 全件更新 |

---

## 2. DB 設計への影響

### 2.1 新規テーブル追加

| テーブル | 概要 | 関連 FR |
|---|---|---|
| **TBL-nurse_facility_engagements** | 看護師⇔クリニックの業務委託契約 | FR-NEW-01〜06, FR-NEW-30 |
| **TBL-engagement_pricing** | 業務委託料率（メニュー × 看護師×クリニック） | FR-NEW-07 |
| **TBL-engagement_orientations** | 院内オリエンテーション完了管理 | FR-NEW-08 |
| **TBL-nurse_business_certificates** | 独立事業者証明（開業届等） | FR-NEW-09 |
| **TBL-nurse_insurance** | 看護師の保険加入証明 | FR-NEW-10 |
| **TBL-clinic_invoices** | クリニック向け月次請求書 | FR-NEW-11, 12 |
| **TBL-nurse_payouts** | 業務委託費精算明細 | FR-NEW-13 |
| **TBL-engagement_amendments** | 業務委託契約改定履歴 | FR-NEW-06 |
| **TBL-incident_reports** | 重大事故・副作用報告 | FR-NEW-23 |
| **TBL-emergency_contacts** | 緊急時連絡先テンプレート | FR-NEW-34 |
| **TBL-treatment_courses** | 施術コース管理（複数施術） | FR-NEW-41 |
| **TBL-medical_information_access_reports** | 月次アクセスレポート | FR-NEW-20 |

**合計: 12 新規テーブル**

### 2.2 既存テーブルの主要改訂

#### TBL-bookings
- `engagement_id UUID` カラム追加（業務委託契約 FK）
- `recipient_clinic_id UUID` カラム追加（受領クリニック明示）

#### TBL-customer_bookings
- `clinic_id UUID NOT NULL` カラム追加（医療提供主体明示）

#### TBL-spaces
- `nurse_engagement_required BOOLEAN` カラム追加（業務委託契約要否、デフォルト true）

#### TBL-space_pricing
- **大幅縮小 or 削除**: メニュー料金は engagement_pricing で管理
- 既存テーブルは残しつつ、`is_active=false` で運用

#### TBL-payments
- `recipient_type` 列削除（clinic 固定）
- `nurse_share_amount`, `clinic_share_amount`, `platform_fee_amount` を明示
- `stripe_connect_account_id` は clinic の Connect ID のみ

#### TBL-customer_payments
- `recipient_clinic_id UUID NOT NULL` カラム追加
- `stripe_connect_account_id` は clinic のみ

#### TBL-consent_templates
- `owner_type` enum から `'nurse'` を削除（**`'platform' / 'facility'` のみ**）

#### TBL-stripe_connect_accounts
- `owner_type` enum から `'nurse'` を削除（**`'facility' / 'organization'` のみ**）

#### TBL-users.nurse_profiles
- `business_certificate_status VARCHAR(20)` カラム追加（'none' / 'pending' / 'approved'）

### 2.3 削除候補テーブル

| テーブル | 理由 |
|---|---|
| なし | 既存テーブルは構造改訂で対応、削除はしない |

### 2.4 マイグレーション影響

新規マイグレーション 019-026 を追加:

| 順 | 名前 |
|---|---|
| 019 | `add_engagement_tables` (nurse_facility_engagements, engagement_pricing, engagement_orientations) |
| 020 | `add_nurse_compliance_tables` (nurse_business_certificates, nurse_insurance) |
| 021 | `add_financial_settlement_tables` (clinic_invoices, nurse_payouts) |
| 022 | `add_amendment_history` (engagement_amendments) |
| 023 | `add_incident_emergency_tables` (incident_reports, emergency_contacts) |
| 024 | `add_treatment_courses_table` (treatment_courses) |
| 025 | `add_medical_info_access_reports` (medical_information_access_reports) |
| 026 | `alter_existing_tables_for_engagement_model` (既存テーブル改訂) |

---

## 3. API 仕様への影響

### 3.1 新規エンドポイント

| EP-ID | Method | Path | 関連 FR |
|---|---|---|---|
| **EP-L001** | GET | /api/v1/engagements/clinics/search | FR-NEW-01 |
| **EP-L002** | POST | /api/v1/engagements/applications | FR-NEW-02 |
| **EP-L003** | GET | /api/v1/engagements/applications/{id} | FR-NEW-02 |
| **EP-L004** | POST | /api/v1/engagements/applications/{id}/respond | FR-NEW-02 |
| **EP-L005** | POST | /api/v1/engagements/{id}/initiate-sign | FR-NEW-03 |
| **EP-L006** | POST | /api/webhooks/cloud-sign | FR-NEW-03 |
| **EP-L007** | GET | /api/v1/engagements | FR-NEW-04 |
| **EP-L008** | GET | /api/v1/engagements/{id} | FR-NEW-04 |
| **EP-L009** | POST | /api/v1/engagements/{id}/terminate | FR-NEW-05 |
| **EP-L010** | POST | /api/v1/engagements/{id}/amend | FR-NEW-06 |
| **EP-L011** | PUT | /api/v1/engagements/{id}/pricing | FR-NEW-07 |
| **EP-L012** | POST | /api/v1/engagements/{id}/orientation/complete | FR-NEW-08 |
| **EP-L013** | POST | /api/v1/nurse/business-certificate | FR-NEW-09 |
| **EP-L014** | POST | /api/v1/nurse/insurance | FR-NEW-10 |
| **EP-L015** | GET | /api/v1/facility/invoices | FR-NEW-11 |
| **EP-L016** | POST | /api/v1/facility/invoices/{id}/pay | FR-NEW-12 |
| **EP-L017** | GET | /api/v1/finance/engagement-payouts | FR-NEW-13 |
| **EP-L018** | GET | /api/v1/medical-information/access-reports | FR-NEW-20 |
| **EP-L019** | POST | /api/v1/incidents/report | FR-NEW-23 |
| **EP-L020** | POST | /api/v1/emergency/dispatch | FR-NEW-35 |

**合計: 約 20 新規 EP**

### 3.2 改訂が必要な既存 EP

| EP | 改訂内容 |
|---|---|
| EP-C001 スペース検索 | engagement_status=active フィルタ強制 |
| EP-C003 予約申込 | engagement_id バリデーション追加 |
| EP-D003 電子指示書発行 | 看護師の engagement との整合性チェック |
| EP-E001〜E005 看護師カード | **削除** |
| EP-B028〜B031 Stripe Connect | クリニック・法人向けのみに整理 |
| EP-E010, E011 利用客事前決済 | recipient_clinic_id 必須化 |
| EP-E012 手数料明細 | クリニック視点で再構成 |
| EP-D007〜D009 同意書テンプレ | owner_type='nurse' 削除 |
| EP-G002 レビュー投稿 | クリニック中心、限定解除要件チェック |

### 3.3 削除される EP

| EP | 理由 |
|---|---|
| EP-E001〜E005 看護師カード | 不要 |
| EP-B028（看護師向け Connect 部分） | 看護師個別 Connect 廃止 |

---

## 4. 権限設計 (RLS) への影響

### 4.1 RLS 全面再確認が必要なテーブル

業務委託契約モデルでは、看護師の権限が「クリニックとの engagement」に依存。以下の RLS ポリシーを **書き直し** が必要:

| テーブル | 改訂内容 |
|---|---|
| bookings | nurse_user_id だけでなく、**当該 facility と active engagement があるか** を確認 |
| treatment_records | 看護師は自分が施術 + 当該 facility と engagement があった記録のみ |
| prescriptions | 同上 |
| customer_bookings | nurse + clinic 両方の関係者がアクセス可 |
| nurse_facility_engagements (NEW) | 当事者（看護師 + クリニック関係者）と運営のみ |
| engagement_pricing (NEW) | 同上 |
| clinic_invoices (NEW) | クリニック関係者と運営のみ |
| nurse_payouts (NEW) | 看護師本人 + クリニック関係者 + 運営 |

### 4.2 RLS ヘルパー関数の追加

```sql
-- 新規ヘルパー: 看護師が当該クリニックと active engagement を持つか
CREATE OR REPLACE FUNCTION auth.nurse_has_active_engagement(facility_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM nurse_facility_engagements
    WHERE nurse_user_id = auth.uid()
      AND facility_id = $1
      AND status = 'active'
  )
$$ LANGUAGE SQL STABLE;
```

### 4.3 権限マトリクス (03_権限マトリクス_API.md) の改訂

[10_影響マップ_Phase1 §3.2] のテーブル拡張を反映。

---

## 5. 画面設計への影響

### 5.1 新規画面ファイル

| ファイル | 内容 |
|---|---|
| `04_画面設計/15_業務委託画面.md` | SCR-NEW-01〜08 + 関連画面 |

### 5.2 既存画面ファイルの改訂

| ファイル | 改訂内容 |
|---|---|
| `04_画面設計/05_予約画面.md` | SCR-40, 42, 46 等の改訂 |
| `04_画面設計/07_決済画面.md` | SCR-60 削除候補、SCR-65 改訂 |
| `04_画面設計/11_公開ページ画面.md` | SCR-100, 101 全面改訂 |
| `04_画面設計/13_顧客予約画面.md` | SCR-120 表記調整 |
| `04_画面設計/12_ダッシュボード画面.md` | 各ダッシュに業務委託情報追加 |

---

## 6. 非機能要件 (NFR) への影響

### 6.1 NFR-CMPL（コンプライアンス）の強化

| NFR-CMPL-XX | 現行 | 新方向性 |
|---|---|---|
| NFR-CMPL-01 医師法・保助看法 | A 案で担保 | A 案 + **業務委託契約** で更に明確化 |
| NFR-CMPL-02 個人情報保護法 | 標準 | **要配慮個人情報・診療情報として強化** |
| NFR-CMPL-03 医療記録 7 年保存 | 維持 | 維持 + **クリニック委託としての位置づけ** |
| NFR-CMPL-04 特商法 | 維持 | 維持 + **販売者 = クリニック** 明示 |
| NFR-CMPL-05 電子署名法 | 電子指示書 | 電子指示書 + **電子契約（業務委託）** |
| NFR-CMPL-06 PCI DSS 回避 | 維持 | 維持 |
| NFR-CMPL-07 GDPR/CCPA | P2 | P2 |
| **NFR-CMPL-08** (新規) | - | **医療情報安全管理ガイドライン 第 6.0 版 準拠** |
| **NFR-CMPL-09** (新規) | - | **医療広告ガイドライン準拠** |
| **NFR-CMPL-10** (新規) | - | **電子帳簿保存法対応**（業務委託契約書・請求書） |
| **NFR-CMPL-11** (新規) | - | **募集情報等提供事業の届出**（弁護士確認後） |

### 6.2 NFR-SEC（セキュリティ）の追加

| ID | 内容 |
|---|---|
| **NFR-SEC-16**（新規） | 医療情報のアクセスログ提供（クリニックへの月次） |
| **NFR-SEC-17**（新規） | 越境移転の同意取得 |

---

## 7. テスト戦略への影響

### 7.1 新規 AC（受入基準）の追加

- 業務委託マッチング: AC-NEW-L01-01 〜
- 業務委託契約締結: AC-NEW-L03-01 〜
- 業務委託料率: AC-NEW-L07-01 〜
- 月次請求: AC-NEW-L11-01 〜

**合計 約 100 新規 AC**

### 7.2 既存 AC の改訂

| AC | 改訂内容 |
|---|---|
| AC-21-01 予約申込 | engagement バリデーションのチェック追加 |
| AC-22-01 予約承認 | Stripe Authorization 先 = クリニック Connect |
| AC-29-01 指示書発行 | engagement 整合性チェック |
| AC-32-01 同意書記入 | クリニック名表記の確認 |
| AC-69-01 看護師公開ページ | クリニック明示の確認 |
| AC-70-01 ゲスト予約 | クリニック明示の確認 |

### 7.3 新規テストカテゴリ

- **業務委託契約のテスト** (E2E + Integration)
- **料率計算のテスト** (Unit)
- **月次請求生成のテスト** (Integration)
- **業務委託費精算のテスト** (Unit + Integration)
- **医療広告規制チェックのテスト** (Unit)

---

## 8. _index.yml の改訂

新規 tables / endpoints / screens / NFR / ac_test_mapping を全て追加。

---

## 9. 思考の足跡

### 9.1 改訂規模の見積もり

- **新規テーブル**: 12
- **既存テーブル改訂**: 約 10
- **新規 EP**: 約 20
- **既存 EP 改訂**: 約 15
- **新規 SCR**: 約 8
- **既存 SCR 改訂**: 約 10
- **新規 NFR**: 約 5
- **新規 AC**: 約 100
- **新規 RLS ポリシー**: 約 20

工数見積もり（AI 駆動）:
- DB 設計ファイル改訂: 2-3 人日
- API 仕様ファイル改訂: 3-4 人日
- 権限設計ファイル改訂: 2-3 人日
- 画面設計ファイル改訂: 1-2 人日
- NFR / テスト戦略改訂: 1 人日
- _index.yml 全件更新: 半日

**Phase 2 改訂 合計: 約 10-13 人日**

### 9.2 残された問い

- 新規テーブル設計の詳細は別ブランチで実装する際に確定
- 削除候補テーブルを物理削除 vs `deprecated=true` フラグで残すか

---

バージョン: 0.1 / 作成日: 2026-05-18
