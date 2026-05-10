# 権限設計 — RLS / D. 指示書記録・E. 決済

> [00_index.md](00_index.md) に戻る

## TBL-prescriptions（追記専用）

```sql
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: 関係者
CREATE POLICY "prescriptions_select" ON prescriptions FOR SELECT USING (
  auth.is_ops()
  OR doctor_user_id = auth.uid()
  OR nurse_user_id = auth.uid()
  OR facility_id = auth.current_facility_id()
  OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
);

-- INSERT: 自分が担当する施設の booking_session に対してのみ
CREATE POLICY "prescriptions_insert" ON prescriptions FOR INSERT WITH CHECK (
  doctor_user_id = auth.uid()
  AND auth.current_role() = 'doctor'
  AND auth.doctor_belongs_to_facility(facility_id)
  -- prescription_issue_enabled は app_metadata 経由で判定
  AND (auth.jwt() -> 'app_metadata' ->> 'prescription_issue_enabled')::boolean = true
);

-- UPDATE / DELETE は禁止（追記専用、トリガーで防御）
```

> 失効は新規 INSERT で `superseded_by_prescription_id` チェーン化。

---

## TBL-prescription_pdfs

```sql
ALTER TABLE prescription_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pres_pdf_select" ON prescription_pdfs FOR SELECT USING (
  prescription_id IN (SELECT id FROM prescriptions)  -- prescriptions の RLS 継承
);

-- INSERT は Service Role 経由（バックグラウンドジョブ）
```

---

## TBL-consent_templates

```sql
ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ct_select" ON consent_templates FOR SELECT USING (
  -- platform 標準は誰でも閲覧
  owner_type = 'platform'
  OR auth.is_ops()
  OR (owner_type = 'facility' AND owner_id = auth.current_facility_id())
  OR (owner_type = 'facility' AND owner_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id()))
  OR (owner_type = 'nurse' AND owner_id = auth.uid())
);

CREATE POLICY "ct_modify" ON consent_templates FOR ALL USING (
  auth.is_ops() AND owner_type = 'platform'
  OR (auth.current_role() = 'facility_admin' AND owner_type = 'facility' AND owner_id = auth.current_facility_id())
  OR (auth.current_role() = 'nurse' AND owner_type = 'nurse' AND owner_id = auth.uid())
);
```

---

## TBL-customer_consents（追記専用）

```sql
ALTER TABLE customer_consents ENABLE ROW LEVEL SECURITY;

-- 関係者のみ閲覧可
CREATE POLICY "cc_select" ON customer_consents FOR SELECT USING (
  auth.is_ops()
  OR (
    -- 担当看護師 / 担当指示医
    booking_session_id IN (
      SELECT bs.id FROM booking_sessions bs
      JOIN bookings b ON bs.booking_id = b.id
      WHERE b.nurse_user_id = auth.uid()
        OR auth.doctor_belongs_to_facility(b.facility_id)
        OR b.facility_id = auth.current_facility_id()
    )
  )
);

-- INSERT: ゲストトークン経由（Service Role）
-- UPDATE / DELETE: 禁止（追記専用、トリガー）
```

---

## TBL-questionnaire_templates, customer_questionnaire_responses

`consent_templates` / `customer_consents` と同パターン。

---

## TBL-treatment_records（限定更新可）

```sql
ALTER TABLE treatment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tr_select" ON treatment_records FOR SELECT USING (
  auth.is_ops()
  OR nurse_user_id = auth.uid()
  OR facility_id = auth.current_facility_id()
  OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  OR (
    auth.current_role() = 'doctor'
    AND auth.doctor_belongs_to_facility(facility_id)
  )
);

CREATE POLICY "tr_insert" ON treatment_records FOR INSERT WITH CHECK (
  nurse_user_id = auth.uid()
  AND auth.current_role() = 'nurse'
);

-- UPDATE は限定: 看護師は自分の record で status='submitted' のみ、医師は status と confirmed_at のみ
CREATE POLICY "tr_update_nurse" ON treatment_records FOR UPDATE USING (
  nurse_user_id = auth.uid() AND status = 'submitted'
);

CREATE POLICY "tr_update_doctor_confirm" ON treatment_records FOR UPDATE USING (
  auth.current_role() = 'doctor'
  AND auth.doctor_belongs_to_facility(facility_id)
);
```

> body 列の改ざん防止はトリガーで列レベル制限。

---

## TBL-treatment_record_addenda, treatment_record_images

`treatment_records` を継承。

---

## TBL-payments

```sql
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON payments FOR SELECT USING (
  auth.is_ops()
  OR nurse_user_id = auth.uid()
  OR facility_id = auth.current_facility_id()
  OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
);

-- INSERT / UPDATE は Service Role 経由（Stripe Webhook 処理 / 内部ジョブ）
```

---

## TBL-customer_payments

```sql
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_select" ON customer_payments FOR SELECT USING (
  auth.is_ops()
  OR nurse_user_id = auth.uid()
);

-- INSERT / UPDATE は Service Role
```

---

## TBL-refunds

```sql
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds_select" ON refunds FOR SELECT USING (
  auth.is_ops()
  OR payment_id IN (SELECT id FROM payments)
  OR customer_payment_id IN (SELECT id FROM customer_payments)
);

-- INSERT は ops のみ（Server Action 内）
CREATE POLICY "refunds_insert" ON refunds FOR INSERT WITH CHECK (auth.is_ops());
```

---

## TBL-platform_revenue, stripe_events, stripe_connect_accounts

```sql
-- platform_revenue: ops のみ
ALTER TABLE platform_revenue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_ops_only" ON platform_revenue FOR ALL USING (auth.is_ops());

-- stripe_events: Service Role のみ（Webhook 処理用、ops は監査閲覧）
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "se_select" ON stripe_events FOR SELECT USING (auth.is_ops());

-- stripe_connect_accounts: 関係 facility / org / ops
ALTER TABLE stripe_connect_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sca_select" ON stripe_connect_accounts FOR SELECT USING (
  auth.is_ops()
  OR (owner_type = 'facility' AND owner_id = auth.current_facility_id())
  OR (
    owner_type = 'facility'
    AND owner_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
  OR (owner_type = 'organization' AND owner_id = auth.current_organization_id())
);
```

---

[← 05_RLS_スペース予約.md](05_RLS_スペース予約.md) | [次: 07_RLS_通知運営横断.md →](07_RLS_通知運営横断.md)
