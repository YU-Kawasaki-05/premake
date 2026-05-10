# 権限設計 — RLS / B. スペース・C. 予約

> [00_index.md](00_index.md) に戻る

## TBL-spaces

```sql
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;

-- SELECT: published は誰でも、内部は施設関係者のみ
CREATE POLICY "spaces_select" ON spaces FOR SELECT USING (
  auth.is_ops()
  OR (status = 'published' AND deleted_at IS NULL)  -- 公開
  OR facility_id = auth.current_facility_id()
  OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  OR auth.doctor_belongs_to_facility(facility_id)
);

CREATE POLICY "spaces_insert" ON spaces FOR INSERT WITH CHECK (
  auth.is_ops()
  OR (auth.current_role() = 'facility_admin' AND facility_id = auth.current_facility_id())
  OR (
    auth.current_role() = 'org_admin'
    AND facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);

CREATE POLICY "spaces_update" ON spaces FOR UPDATE USING (
  auth.is_ops()
  OR (auth.current_role() = 'facility_admin' AND facility_id = auth.current_facility_id())
  OR (
    auth.current_role() = 'org_admin'
    AND facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);
```

---

## TBL-space_images, space_pricing, space_availability_rules, space_availability_overrides

`spaces` を JOIN して同等のポリシー。

```sql
ALTER TABLE space_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "space_pricing_select" ON space_pricing FOR SELECT USING (
  auth.is_ops()
  OR space_id IN (
    SELECT id FROM spaces  -- 上記 spaces のポリシーを継承（再帰）
    WHERE status = 'published' OR facility_id = auth.current_facility_id()
       OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);

CREATE POLICY "space_pricing_modify" ON space_pricing FOR ALL USING (
  auth.is_ops()
  OR space_id IN (
    SELECT id FROM spaces
    WHERE facility_id = auth.current_facility_id()
       OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);
```

> パターンは同じ。`space_images` `space_availability_rules` `space_availability_overrides` も同じく `spaces` 経由でフィルタ。

---

## TBL-bookings

```sql
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select" ON bookings FOR SELECT USING (
  auth.is_ops()
  OR nurse_user_id = auth.uid()
  OR facility_id = auth.current_facility_id()
  OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  OR auth.doctor_belongs_to_facility(facility_id)
);

CREATE POLICY "bookings_insert" ON bookings FOR INSERT WITH CHECK (
  -- 看護師が自分の予約として申込
  nurse_user_id = auth.uid()
  AND auth.current_role() = 'nurse'
);

CREATE POLICY "bookings_update" ON bookings FOR UPDATE USING (
  auth.is_ops()
  OR (nurse_user_id = auth.uid() AND status IN ('pending_approval', 'approved'))
  OR (auth.current_role() = 'facility_admin' AND facility_id = auth.current_facility_id())
  OR (
    auth.current_role() = 'org_admin'
    AND facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);
```

---

## TBL-booking_sessions

```sql
ALTER TABLE booking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_sessions_select" ON booking_sessions FOR SELECT USING (
  booking_id IN (SELECT id FROM bookings)  -- bookings の RLS が伝播
);

CREATE POLICY "booking_sessions_modify" ON booking_sessions FOR ALL USING (
  booking_id IN (SELECT id FROM bookings)
) WITH CHECK (
  booking_id IN (SELECT id FROM bookings)
);
```

> Postgres の RLS は副問合せにも自動適用されるため、`bookings` の RLS を満たす行のみ JOIN 可能。

---

## TBL-booking_change_requests

```sql
ALTER TABLE booking_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bcr_all" ON booking_change_requests FOR ALL USING (
  booking_id IN (SELECT id FROM bookings)  -- bookings ポリシー継承
) WITH CHECK (
  booking_id IN (SELECT id FROM bookings)
);
```

---

## TBL-cancel_policy_overrides

```sql
ALTER TABLE cancel_policy_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpo_select" ON cancel_policy_overrides FOR SELECT USING (
  -- 公開（看護師が予約申込時に確認するため）
  TRUE
);

CREATE POLICY "cpo_modify" ON cancel_policy_overrides FOR ALL USING (
  auth.is_ops()
  OR (owner_type = 'facility' AND owner_id = auth.current_facility_id() AND auth.current_role() = 'facility_admin')
  OR (owner_type = 'organization' AND owner_id = auth.current_organization_id() AND auth.current_role() = 'org_admin')
  OR (
    -- org_admin が配下 facility 別ポリシーを編集
    owner_type = 'facility'
    AND auth.current_role() = 'org_admin'
    AND owner_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);
```

---

## TBL-nurse_pages

```sql
ALTER TABLE nurse_pages ENABLE ROW LEVEL SECURITY;

-- visibility=public は公開、private はリンク経由のみ（DB 公開）
CREATE POLICY "nurse_pages_select" ON nurse_pages FOR SELECT USING (
  visibility = 'public' OR visibility = 'private'  -- DB 上は両方読み取り可（ハンドルを知る人だけアクセスする想定）
);

CREATE POLICY "nurse_pages_modify_self" ON nurse_pages FOR ALL USING (
  nurse_user_id = auth.uid()
) WITH CHECK (
  nurse_user_id = auth.uid()
);
```

> `visibility=private` のページが検索エンジンにインデックスされないようにするのは、Next.js 側で `noindex` タグを返す（DB レベルの公開とは別）。

---

## TBL-customer_bookings

```sql
ALTER TABLE customer_bookings ENABLE ROW LEVEL SECURITY;

-- 看護師は自分の客の予約のみ
CREATE POLICY "cb_select_nurse" ON customer_bookings FOR SELECT USING (
  auth.is_ops()
  OR nurse_user_id = auth.uid()
  OR auth.doctor_belongs_to_facility(
    (SELECT facility_id FROM bookings WHERE id = (
      SELECT booking_id FROM booking_sessions WHERE id = customer_bookings.linked_booking_session_id
    ))
  )
);

-- 利用客本人は Service Role 経由でアクセス（guest セッショントークン検証後）
-- INSERT は Service Role（看護師の公開ページからの予約は Server-side）
```

---

[← 04_RLS_認証組織.md](04_RLS_認証組織.md) | [次: 06_RLS_指示書記録決済.md →](06_RLS_指示書記録決済.md)
