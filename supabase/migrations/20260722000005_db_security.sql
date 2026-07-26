-- @implements v2-04/v2-07 DB セキュリティ強化(★3-a)
-- 監査由来: AUTH-1 / DB-N-1 / DB-N-3 / DB-N-4 / DB-N-5 / DB-N-7
--
-- 本 migration は「アプリ層(Server Action の requireMember)で担保している権限を DB 層でも
-- 強制する」ことと「複合 FK でクロステナント参照を DB で遮断する」こと、CHECK/UNIQUE の補強を行う。
-- init.sql の汎用 RLS ループ(_select/_insert/_update/_delete)を対象テーブル分だけ owner 版へ差し替える。

-- ===============================================================
-- (1) AUTH-1 [Med] owner 限定テーブルの RLS write 制限
-- ---------------------------------------------------------------
-- staff ロール職員が公開 anon キー + 自分の JWT で PostgREST を直叩きしても
-- owner 限定操作(料金・メニュー・部屋・問診テンプレ等の改ざん)ができないようにする。
-- select は member のまま(既存 <table>_select ポリシーは触らない)。
-- write(insert/update/delete)を owner + ops のみに絞る。
-- ===============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'services','service_categories','rooms','questionnaire_templates',
    'staff_service_assignments','clinic_closures'
  ] loop
    execute format('drop policy %I on %I', t || '_insert', t);
    execute format('drop policy %I on %I', t || '_update', t);
    execute format('drop policy %I on %I', t || '_delete', t);

    execute format(
      'create policy %I on %I for insert with check (app.has_role(clinic_id, ''owner'') or app.is_ops())',
      t || '_insert', t
    );
    -- with check にも owner 条件を課し、clinic_id 書き換えによるクロステナント行移送も防ぐ
    execute format(
      'create policy %I on %I for update using (app.has_role(clinic_id, ''owner'') or app.is_ops()) with check (app.has_role(clinic_id, ''owner'') or app.is_ops())',
      t || '_update', t
    );
    execute format(
      'create policy %I on %I for delete using (app.has_role(clinic_id, ''owner'') or app.is_ops())',
      t || '_delete', t
    );
  end loop;
end $$;

-- patients: delete のみ owner + ops に絞る(DB-N-3: 監査なし物理削除の緩和)。
-- insert/update/select は member のまま(受付が患者登録・編集するため)。
drop policy patients_delete on patients;
create policy patients_delete on patients for delete
  using (app.has_role(clinic_id, 'owner') or app.is_ops());

-- 業務テーブル(bookings / booking_sessions / schedule_blocks / questionnaire_responses)は
-- 受付・看護師の日常業務のため member のまま維持(init.sql の汎用ポリシーをそのまま使う)。

-- ===============================================================
-- (2) DB-N-1 [Med] 複合 FK でクロステナント参照を DB 層で遮断
-- ---------------------------------------------------------------
-- 現状: 業務テーブルの FK が参照先の clinic_id 一致を強制せず、RLS の with check も clinic_id しか
-- 見ないため、認証済みメンバーが PostgREST 直叩きで他院の部屋・スタッフの時間帯を EXCLUDE 占有
-- ロックできる。参照先に (id, clinic_id) の複合 UNIQUE を張り、業務テーブルに複合 FK を追加して、
-- 「参照する行の clinic_id が自分の clinic_id と一致すること」を DB 制約で強制する。
--
-- 既存の単一 FK(on delete cascade / set null)は削除挙動維持のため残し、複合 FK を「追加」する。
-- 複合 FK は既定の MATCH SIMPLE + NO ACTION:
--   - MATCH SIMPLE: FK 列のいずれかが NULL なら制約を課さない。nullable 列(nominated_member_id,
--     schedule_block_id, questionnaire_template_id, category_id, patient_id 等)は NULL 時に素通しで
--     問題ない(clinic_id は NOT NULL なので、参照列が非 NULL のときは必ず (参照 id, clinic_id) を照合)。
--   - NO ACTION は文末評価。親削除時は同一子行にある単一 FK の cascade/set null が先に実行され、
--     文末には孤児が残らないため既存の削除経路(bookings 削除→sessions cascade、
--     schedule_blocks 削除→sessions.schedule_block_id set null)を壊さない(db-security.test.ts (f) で実証)。
-- ===============================================================

-- 参照先テーブルに複合 UNIQUE(FK ターゲット。id は PK で既に一意だが複合 FK には (id, clinic_id) の
-- 一意制約が必要)
alter table clinic_members         add constraint clinic_members_id_clinic_uk         unique (id, clinic_id);
alter table rooms                  add constraint rooms_id_clinic_uk                  unique (id, clinic_id);
alter table bookings               add constraint bookings_id_clinic_uk               unique (id, clinic_id);
alter table patients               add constraint patients_id_clinic_uk               unique (id, clinic_id);
alter table services               add constraint services_id_clinic_uk               unique (id, clinic_id);
alter table service_categories     add constraint service_categories_id_clinic_uk     unique (id, clinic_id);
alter table schedule_blocks        add constraint schedule_blocks_id_clinic_uk        unique (id, clinic_id);
alter table questionnaire_templates add constraint questionnaire_templates_id_clinic_uk unique (id, clinic_id);

-- 業務テーブルに複合 FK を追加(単一 FK は残す)
alter table booking_sessions
  add constraint booking_sessions_booking_clinic_fk
    foreign key (booking_id, clinic_id) references bookings (id, clinic_id),
  add constraint booking_sessions_member_clinic_fk
    foreign key (member_id, clinic_id) references clinic_members (id, clinic_id),
  add constraint booking_sessions_room_clinic_fk
    foreign key (room_id, clinic_id) references rooms (id, clinic_id),
  add constraint booking_sessions_block_clinic_fk
    foreign key (schedule_block_id, clinic_id) references schedule_blocks (id, clinic_id);

alter table bookings
  add constraint bookings_patient_clinic_fk
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  add constraint bookings_service_clinic_fk
    foreign key (service_id, clinic_id) references services (id, clinic_id),
  add constraint bookings_nominated_clinic_fk
    foreign key (nominated_member_id, clinic_id) references clinic_members (id, clinic_id);

alter table schedule_blocks
  add constraint schedule_blocks_member_clinic_fk
    foreign key (member_id, clinic_id) references clinic_members (id, clinic_id),
  add constraint schedule_blocks_room_clinic_fk
    foreign key (room_id, clinic_id) references rooms (id, clinic_id);

alter table staff_service_assignments
  add constraint staff_service_assignments_member_clinic_fk
    foreign key (member_id, clinic_id) references clinic_members (id, clinic_id),
  add constraint staff_service_assignments_service_clinic_fk
    foreign key (service_id, clinic_id) references services (id, clinic_id);

alter table services
  add constraint services_category_clinic_fk
    foreign key (category_id, clinic_id) references service_categories (id, clinic_id),
  add constraint services_template_clinic_fk
    foreign key (questionnaire_template_id, clinic_id) references questionnaire_templates (id, clinic_id);

alter table questionnaire_responses
  add constraint questionnaire_responses_booking_clinic_fk
    foreign key (booking_id, clinic_id) references bookings (id, clinic_id),
  add constraint questionnaire_responses_template_clinic_fk
    foreign key (template_id, clinic_id) references questionnaire_templates (id, clinic_id);

-- ===============================================================
-- (3) DB-N-4/5/7 [Low] CHECK・UNIQUE の補強
-- ===============================================================
-- DB-N-4: 料金は非負、施術ステップ(session_template)は 1 件以上
alter table services
  add constraint services_price_nonneg_chk check (price_yen >= 0),
  add constraint services_session_template_nonempty_chk check (jsonb_array_length(session_template) >= 1);

-- DB-N-4: キャンセル期限は非負
alter table clinics
  add constraint clinics_cancel_deadline_nonneg_chk check (cancel_deadline_hours >= 0);

-- DB-N-5: roles 空配列 {} を拒否(権限ゼロのゴーストメンバー防止)。
-- array_length(roles,1) は空配列で NULL を返し CHECK を素通りするため cardinality を使う。
alter table clinic_members
  add constraint clinic_members_roles_nonempty_chk check (cardinality(roles) >= 1);

-- DB-N-7: 同一予約×同一テンプレの問診回答は 1 件(問診記入フロー実装時の重複防止)
alter table questionnaire_responses
  add constraint questionnaire_responses_booking_template_uk unique (booking_id, template_id);
