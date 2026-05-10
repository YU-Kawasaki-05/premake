# 権限設計 — RLS / F. 通知 G. レビュー H. 運営 横断

> [00_index.md](00_index.md) に戻る

## TBL-chat_threads, chat_messages, chat_message_attachments

```sql
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_select" ON chat_threads FOR SELECT USING (
  auth.is_ops()
  OR nurse_user_id = auth.uid()
  OR facility_id = auth.current_facility_id()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_select" ON chat_messages FOR SELECT USING (
  thread_id IN (SELECT id FROM chat_threads)  -- chat_threads の RLS 継承
);
CREATE POLICY "cm_insert" ON chat_messages FOR INSERT WITH CHECK (
  thread_id IN (SELECT id FROM chat_threads)
  AND sender_user_id = auth.uid()
);
-- UPDATE は read_by の更新のみ許可（編集不可）

ALTER TABLE chat_message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cma_select" ON chat_message_attachments FOR SELECT USING (
  message_id IN (SELECT id FROM chat_messages)
);
```

---

## TBL-notifications

```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (
  user_id = auth.uid() OR auth.is_ops()
);

CREATE POLICY "notifications_update_self" ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

-- INSERT は Service Role（送信ジョブ）
```

---

## TBL-notification_preferences

```sql
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np_self" ON notification_preferences FOR ALL USING (
  user_id = auth.uid() OR auth.is_ops()
) WITH CHECK (user_id = auth.uid() OR auth.is_ops());
```

---

## TBL-reviews

```sql
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: 公開設定や関係性で
CREATE POLICY "reviews_select" ON reviews FOR SELECT USING (
  auth.is_ops()
  OR (visibility = 'public' AND status = 'active')
  OR reviewer_user_id = auth.uid()  -- 自分のレビューは visibility 問わず
  OR (
    visibility IN ('facility_only', 'platform_only')
    AND target_type IN ('space', 'facility')
    AND target_id IN (
      SELECT id FROM facilities WHERE id = auth.current_facility_id()
        OR organization_id = auth.current_organization_id()
    )
  )
);

CREATE POLICY "reviews_insert" ON reviews FOR INSERT WITH CHECK (
  reviewer_user_id = auth.uid()
);

CREATE POLICY "reviews_update_self" ON reviews FOR UPDATE USING (
  reviewer_user_id = auth.uid() AND edit_until > now()
);
```

---

## TBL-review_reports

```sql
ALTER TABLE review_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rr_select" ON review_reports FOR SELECT USING (
  auth.is_ops() OR reporter_user_id = auth.uid()
);

CREATE POLICY "rr_insert" ON review_reports FOR INSERT WITH CHECK (
  reporter_user_id = auth.uid()
);

-- 更新（モデレーション結果）は ops のみ
CREATE POLICY "rr_update_ops" ON review_reports FOR UPDATE USING (auth.is_ops());
```

---

## TBL-applications, violations, audit_log, export_logs, inquiries, announcements, term_versions

```sql
-- applications: ops のみ全件、申請者本人は自分の申請のみ
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_select" ON applications FOR SELECT USING (
  auth.is_ops() OR email = auth.email()
);
CREATE POLICY "app_insert_public" ON applications FOR INSERT WITH CHECK (TRUE);  -- 公開申請

-- violations: ops のみ
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "violations_ops" ON violations FOR ALL USING (auth.is_ops());

-- audit_log: ops のみ閲覧、その他テーブルからの追記は Service Role
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_ops" ON audit_log FOR SELECT USING (auth.is_ops());
-- INSERT は Service Role
-- UPDATE / DELETE はトリガーで全拒否

-- export_logs: ops のみ
ALTER TABLE export_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "export_ops" ON export_logs FOR ALL USING (auth.is_ops());

-- inquiries: ops のみ閲覧、INSERT は公開
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inq_select_ops" ON inquiries FOR SELECT USING (auth.is_ops());
CREATE POLICY "inq_insert_public" ON inquiries FOR INSERT WITH CHECK (TRUE);

-- announcements: ops 編集、公開 SELECT は対象セグメント
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ann_select" ON announcements FOR SELECT USING (
  auth.is_ops()
  OR (
    published_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      target_segment = 'all'
      OR (target_segment = 'nurses' AND auth.current_role() = 'nurse')
      OR (target_segment = 'facilities' AND auth.current_role() IN ('facility_admin','doctor'))
      OR (target_segment = 'orgs' AND auth.current_role() = 'org_admin')
      OR (target_segment = 'specific_users' AND auth.uid() = ANY(target_user_ids))
    )
  )
);
CREATE POLICY "ann_modify_ops" ON announcements FOR ALL USING (auth.is_ops());

-- term_versions: 公開 SELECT、編集 ops のみ
ALTER TABLE term_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tv_select_public" ON term_versions FOR SELECT USING (TRUE);
CREATE POLICY "tv_modify_ops" ON term_versions FOR ALL USING (auth.is_ops());
```

---

## TBL-worker_jobs, feature_flags, system_health_events

```sql
-- worker_jobs: ops のみ閲覧、書き込みは Service Role
ALTER TABLE worker_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wj_select_ops" ON worker_jobs FOR SELECT USING (auth.is_ops());

-- feature_flags: ops のみ編集、SELECT は公開可能なものだけアプリ層でフィルタ
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ff_select" ON feature_flags FOR SELECT USING (
  auth.is_ops() OR enabled = true  -- enabled なものは認証済ユーザーが評価できるよう
);
CREATE POLICY "ff_modify_ops" ON feature_flags FOR ALL USING (auth.is_ops());

-- system_health_events: ops のみ
ALTER TABLE system_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "she_ops" ON system_health_events FOR ALL USING (auth.is_ops());
```

---

## RLS テスト戦略

各 RLS は以下のシナリオを **必ず Integration テスト**:

```typescript
describe("bookings RLS", () => {
  test("nurse can read own bookings", async () => { ... });
  test("nurse cannot read other nurse's bookings", async () => { ... });
  test("facility_admin can read own facility's bookings", async () => { ... });
  test("facility_admin cannot read other facility's bookings", async () => { ... });
  test("ops can read all", async () => { ... });
  test("anon cannot read any", async () => { ... });
});
```

> 詳細は [`../06_テスト戦略.md`](../06_テスト戦略.md)。

---

[← 06_RLS_指示書記録決済.md](06_RLS_指示書記録決済.md) | [次: 08_認証フロー.md →](08_認証フロー.md)
