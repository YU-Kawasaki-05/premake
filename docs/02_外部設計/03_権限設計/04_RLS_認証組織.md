# 権限設計 — RLS / A. 認証・組織・ユーザー

> [00_index.md](00_index.md) に戻る

> **大原則**: すべてのテーブルに RLS ENABLE。ポリシーが書かれていないと SELECT すら不可。

## 共通ヘルパー関数

```sql
-- 現在ユーザーの role
CREATE OR REPLACE FUNCTION auth.current_role()
RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role'
$$ LANGUAGE SQL STABLE;

-- 現在ユーザーの facility_id
CREATE OR REPLACE FUNCTION auth.current_facility_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'facility_id')::UUID
$$ LANGUAGE SQL STABLE;

-- 現在ユーザーの organization_id
CREATE OR REPLACE FUNCTION auth.current_organization_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID
$$ LANGUAGE SQL STABLE;

-- 運営チェック
CREATE OR REPLACE FUNCTION auth.is_ops()
RETURNS BOOLEAN AS $$
  SELECT auth.current_role() = 'ops'
$$ LANGUAGE SQL STABLE;

-- 指示医が当該施設に所属しているか
CREATE OR REPLACE FUNCTION auth.doctor_belongs_to_facility(facility_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM doctor_facility_assignments
    WHERE doctor_user_id = auth.uid()
      AND facility_id = $1
      AND status = 'active'
  )
$$ LANGUAGE SQL STABLE;
```

---

## TBL-organizations

```sql
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select" ON organizations FOR SELECT USING (
  auth.is_ops()
  OR id = auth.current_organization_id()
  OR id IN (SELECT organization_id FROM facilities WHERE id = auth.current_facility_id())
);

CREATE POLICY "organizations_update" ON organizations FOR UPDATE USING (
  auth.is_ops()
  OR (auth.current_role() = 'org_admin' AND id = auth.current_organization_id())
);

-- INSERT / DELETE は ops のみ（Server Action 内部で Service Role 使用）
CREATE POLICY "organizations_insert_service" ON organizations FOR INSERT WITH CHECK (auth.is_ops());
```

---

## TBL-facilities

```sql
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

-- SELECT: 公開状態の自社, 自施設, 自法人配下, ops 全件
CREATE POLICY "facilities_select" ON facilities FOR SELECT USING (
  auth.is_ops()
  OR id = auth.current_facility_id()
  OR organization_id = auth.current_organization_id()
  OR (
    -- 看護師は status=approved の facilities を検索画面で閲覧可
    auth.current_role() = 'nurse'
    AND status = 'approved'
    AND deleted_at IS NULL
  )
  OR auth.doctor_belongs_to_facility(id)
);

CREATE POLICY "facilities_update" ON facilities FOR UPDATE USING (
  auth.is_ops()
  OR (auth.current_role() = 'org_admin' AND organization_id = auth.current_organization_id())
  OR (auth.current_role() = 'facility_admin' AND id = auth.current_facility_id())
);

CREATE POLICY "facilities_insert" ON facilities FOR INSERT WITH CHECK (
  auth.is_ops()
  OR (auth.current_role() = 'org_admin' AND organization_id = auth.current_organization_id())
);

-- DELETE は ops のみ（通常はソフトデリート）
```

---

## TBL-users

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分、関係者、ops
CREATE POLICY "users_select" ON users FOR SELECT USING (
  auth.is_ops()
  OR id = auth.uid()
  -- 同一施設の facility_admin は自施設内 users を閲覧可
  OR (
    auth.current_role() = 'facility_admin'
    AND facility_id = auth.current_facility_id()
  )
  -- 同一法人の org_admin は配下 facility_admin / doctor を閲覧可
  OR (
    auth.current_role() = 'org_admin'
    AND facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);

-- 自プロフィール編集
CREATE POLICY "users_update_self" ON users FOR UPDATE USING (id = auth.uid());

-- 運営による更新は Service Role 経由（Server Action 内 ops チェック後）
```

---

## TBL-doctor_profiles, TBL-nurse_profiles

```sql
-- 自分のみ書き込み、関係者は読み取り可
ALTER TABLE doctor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctor_profiles_select" ON doctor_profiles FOR SELECT USING (
  auth.is_ops()
  OR user_id = auth.uid()
  OR (
    auth.current_role() IN ('facility_admin', 'org_admin')
    AND user_id IN (SELECT doctor_user_id FROM doctor_facility_assignments WHERE
      facility_id = auth.current_facility_id()
      OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
    )
  )
);
CREATE POLICY "doctor_profiles_upsert_self" ON doctor_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "doctor_profiles_update_self" ON doctor_profiles
  FOR UPDATE USING (user_id = auth.uid());

-- nurse_profiles も同様（自分のみ編集、公開ページ用に nurse_pages.handle 経由で公開閲覧）
```

---

## TBL-doctor_facility_assignments

```sql
ALTER TABLE doctor_facility_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assign_select" ON doctor_facility_assignments FOR SELECT USING (
  auth.is_ops()
  OR doctor_user_id = auth.uid()
  OR facility_id = auth.current_facility_id()
  OR facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
);

CREATE POLICY "assign_insert" ON doctor_facility_assignments FOR INSERT WITH CHECK (
  auth.is_ops()
  OR (auth.current_role() = 'facility_admin' AND facility_id = auth.current_facility_id())
  OR (
    auth.current_role() = 'org_admin'
    AND facility_id IN (SELECT id FROM facilities WHERE organization_id = auth.current_organization_id())
  )
);

CREATE POLICY "assign_update_delete" ON doctor_facility_assignments FOR UPDATE USING (
  auth.is_ops()
  OR (auth.current_role() = 'facility_admin' AND facility_id = auth.current_facility_id())
  OR (auth.current_role() = 'org_admin' AND facility_id IN (
    SELECT id FROM facilities WHERE organization_id = auth.current_organization_id()
  ))
);
```

---

## TBL-invitations

```sql
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- 招待発行者 / 関係 facility / 関係 organization / ops が閲覧可
CREATE POLICY "invitations_select" ON invitations FOR SELECT USING (
  auth.is_ops()
  OR inviter_user_id = auth.uid()
  OR (facility_id = auth.current_facility_id() AND auth.current_role() = 'facility_admin')
  OR (organization_id = auth.current_organization_id() AND auth.current_role() = 'org_admin')
);

CREATE POLICY "invitations_insert" ON invitations FOR INSERT WITH CHECK (
  auth.is_ops()
  OR (
    auth.current_role() = 'facility_admin'
    AND facility_id = auth.current_facility_id()
    AND invitee_role IN ('doctor')  -- 施設管理者は指示医のみ招待可（自施設管理者は ops or org_admin が招待）
  )
  OR (
    auth.current_role() = 'org_admin'
    AND organization_id = auth.current_organization_id()
  )
);

-- 招待受諾は Service Role 経由（受諾時に Supabase Auth ユーザー作成 + invitations 更新）
```

---

## TBL-mfa_settings, TBL-mfa_backup_codes, TBL-user_sessions

```sql
ALTER TABLE mfa_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mfa_select_self" ON mfa_settings FOR SELECT USING (user_id = auth.uid() OR auth.is_ops());
CREATE POLICY "mfa_upsert_self" ON mfa_settings FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- mfa_backup_codes は本人のみ
-- user_sessions は本人 + ops 監査
```

---

## TBL-*_license_applications（看護師/医師/施設/法人）

```sql
ALTER TABLE nurse_license_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nurse_lic_select" ON nurse_license_applications FOR SELECT USING (
  auth.is_ops()
  OR user_id = auth.uid()
);

CREATE POLICY "nurse_lic_insert_self" ON nurse_license_applications FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- 審査結果の更新は ops のみ（Server Action 内 + Service Role）
```

> doctor_license_applications, facility_license_applications, organization_applications も同パターン。

---

## TBL-user_term_consents

```sql
ALTER TABLE user_term_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consents_select_self" ON user_term_consents FOR SELECT USING (user_id = auth.uid() OR auth.is_ops());
CREATE POLICY "consents_insert_self" ON user_term_consents FOR INSERT WITH CHECK (user_id = auth.uid());
-- UPDATE / DELETE は不可（追記のみ）
```

---

[← 03_権限マトリクス_API.md](03_権限マトリクス_API.md) | [次: 05_RLS_スペース予約.md →](05_RLS_スペース予約.md)
