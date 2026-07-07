-- ローカル開発用シード(本番環境では実行しない)
-- ログイン: ops@premake.local / owner@demo.local / nurse1@demo.local / nurse2@demo.local
-- パスワードは全て premake-dev

-- ---------------------------------------------------------------
-- auth users(ローカル専用の直接 insert。profiles はトリガーで自動作成)
-- ---------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000001',
   'authenticated', 'authenticated', 'ops@premake.local',
   extensions.crypt('premake-dev', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"川崎 悠"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000002',
   'authenticated', 'authenticated', 'owner@demo.local',
   extensions.crypt('premake-dev', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"佐藤 まこと"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000003',
   'authenticated', 'authenticated', 'nurse1@demo.local',
   extensions.crypt('premake-dev', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"鈴木 はな"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000004',
   'authenticated', 'authenticated', 'nurse2@demo.local',
   extensions.crypt('premake-dev', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"田中 みお"}', now(), now(), '', '', '', '');

insert into auth.identities
  (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u;

update profiles set is_ops = true where id = '00000000-0000-4000-a000-000000000001';

-- ---------------------------------------------------------------
-- demo clinic
-- ---------------------------------------------------------------
insert into clinics (id, slug, name, director_name, postal_code, address, phone, email,
                     business_hours, public_booking_enabled, booking_approval_mode)
values (
  '10000000-0000-4000-a000-000000000001', 'demo', 'デモクリニック', '佐藤 まこと',
  '150-0001', '東京都渋谷区神宮前 1-1-1', '03-0000-0000', 'info@demo.local',
  '[{"dow":1,"open":"10:00","close":"19:00"},
    {"dow":2,"open":"10:00","close":"19:00"},
    {"dow":3,"open":"10:00","close":"19:00"},
    {"dow":4,"open":"10:00","close":"19:00"},
    {"dow":5,"open":"10:00","close":"19:00"},
    {"dow":6,"open":"10:00","close":"17:00"}]',
  true, 'manual'
);

insert into clinic_members (id, clinic_id, user_id, roles, employment_type, display_name, is_bookable) values
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000002', '{owner,doctor}', 'employed', '佐藤院長', false),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000003', '{staff}', 'employed', '鈴木', true),
  ('20000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000004', '{staff}', 'contracted', '田中', true);

insert into rooms (id, clinic_id, name, sort_order) values
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '施術室 1', 1),
  ('30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', '施術室 2', 2);

-- ---------------------------------------------------------------
-- questionnaire template
-- ---------------------------------------------------------------
insert into questionnaire_templates (id, clinic_id, name, questions) values (
  '40000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001',
  'アートメイク標準問診',
  '[
    {"id":"q1","type":"radio","label":"アートメイクは初めてですか","options":["初めて","経験あり"],"required":true},
    {"id":"q2","type":"checkbox","label":"該当するものがあればお選びください","options":["妊娠中・授乳中","金属アレルギー","ケロイド体質","アトピー性皮膚炎","糖尿病","抗凝固薬を服用中"],"required":false},
    {"id":"q3","type":"textarea","label":"現在治療中の病気・服用中のお薬があればご記入ください","required":false},
    {"id":"q4","type":"textarea","label":"アレルギー(薬剤・食品・化粧品など)があればご記入ください","required":false},
    {"id":"q5","type":"date","label":"直近で麻酔を使用した施術を受けた日(なければ空欄)","required":false},
    {"id":"q6","type":"consent","label":"施術には医師の診察・指示が必要であること、体調によっては当日施術できない場合があることを理解しました","required":true}
  ]'
);

-- ---------------------------------------------------------------
-- services
-- ---------------------------------------------------------------
insert into service_categories (id, clinic_id, name, sort_order) values
  ('50000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'アートメイク', 1),
  ('50000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'スキンケア', 2);

insert into services (id, clinic_id, category_id, name, description, price_yen, show_price,
                      is_public, allow_nomination, questionnaire_template_id, session_template, sort_order) values
  ('60000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001',
   '50000000-0000-4000-a000-000000000001',
   'アートメイク 眉(2回目まで)',
   '医師の診察のうえ、看護師が施術します。個人差により発赤・腫れ・かゆみ等が生じる場合があります。自由診療(保険適用外)です。',
   99000, false, true, true, '40000000-0000-4000-a000-000000000001',
   '[{"kind":"counseling","label":"カウンセリング・医師診察","duration_min":30,"buffer_min":0},
     {"kind":"procedure","label":"施術(1回目)","duration_min":120,"buffer_min":15}]', 1),
  ('60000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001',
   '50000000-0000-4000-a000-000000000001',
   'アートメイク リップ',
   '医師の診察のうえ、看護師が施術します。口唇ヘルペスの既往がある方は事前にご相談ください。自由診療(保険適用外)です。',
   110000, false, true, true, '40000000-0000-4000-a000-000000000001',
   '[{"kind":"counseling","label":"カウンセリング・医師診察","duration_min":30,"buffer_min":0},
     {"kind":"procedure","label":"施術(1回目)","duration_min":150,"buffer_min":15}]', 2),
  ('60000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001',
   '50000000-0000-4000-a000-000000000001',
   'アートメイク リタッチ(3回目以降)',
   '当院でアートメイク施術を受けた方向けのメンテナンスです。自由診療(保険適用外)です。',
   55000, false, true, true, '40000000-0000-4000-a000-000000000001',
   '[{"kind":"retouch","label":"リタッチ施術","duration_min":90,"buffer_min":15}]', 3),
  ('60000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000001',
   '50000000-0000-4000-a000-000000000001',
   'アートメイク カウンセリングのみ',
   '施術をご検討中の方向けの事前カウンセリングです。医師の診察を含みます。',
   0, true, true, false, null,
   '[{"kind":"counseling","label":"カウンセリング・医師診察","duration_min":30,"buffer_min":0}]', 4),
  ('60000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001',
   '50000000-0000-4000-a000-000000000002',
   'メディカルピーリング',
   '医師の診察のうえ実施します。施術後は一時的な赤みが生じる場合があります。自由診療(保険適用外)です。',
   16500, true, true, false, null,
   '[{"kind":"procedure","label":"施術","duration_min":45,"buffer_min":10}]', 5);

insert into staff_service_assignments (clinic_id, member_id, service_id)
select '10000000-0000-4000-a000-000000000001', m.id, s.id
from clinic_members m
cross join services s
where m.is_bookable
  and s.clinic_id = '10000000-0000-4000-a000-000000000001';

-- ---------------------------------------------------------------
-- schedule blocks(明日・明後日の施術枠。Asia/Tokyo 基準)
-- ---------------------------------------------------------------
insert into schedule_blocks (clinic_id, member_id, room_id, time_range, block_type, note)
values
  ('10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002',
   '30000000-0000-4000-a000-000000000001',
   tstzrange(((now() at time zone 'Asia/Tokyo')::date + 1 + time '10:00') at time zone 'Asia/Tokyo',
             ((now() at time zone 'Asia/Tokyo')::date + 1 + time '18:00') at time zone 'Asia/Tokyo', '[)'),
   'open', null),
  ('10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000003',
   '30000000-0000-4000-a000-000000000002',
   tstzrange(((now() at time zone 'Asia/Tokyo')::date + 1 + time '13:00') at time zone 'Asia/Tokyo',
             ((now() at time zone 'Asia/Tokyo')::date + 1 + time '19:00') at time zone 'Asia/Tokyo', '[)'),
   'open', '業務委託・午後のみ'),
  ('10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002',
   '30000000-0000-4000-a000-000000000001',
   tstzrange(((now() at time zone 'Asia/Tokyo')::date + 2 + time '10:00') at time zone 'Asia/Tokyo',
             ((now() at time zone 'Asia/Tokyo')::date + 2 + time '18:00') at time zone 'Asia/Tokyo', '[)'),
   'open', null);

-- ---------------------------------------------------------------
-- patients + booking サンプル
-- ---------------------------------------------------------------
insert into patients (id, clinic_id, name, kana, phone, email) values
  ('70000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001',
   '山田 花子', 'ヤマダ ハナコ', '090-0000-0001', 'hanako@example.com'),
  ('70000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001',
   '高橋 直美', 'タカハシ ナオミ', '090-0000-0002', 'naomi@example.com');

insert into bookings (id, clinic_id, patient_id, service_id, status, source, nominated_member_id, created_by)
values (
  '80000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001',
  '70000000-0000-4000-a000-000000000001', '60000000-0000-4000-a000-000000000001',
  'confirmed', 'phone', '20000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000002'
);

insert into booking_sessions (clinic_id, booking_id, seq, kind, label, member_id, room_id, time_range)
values
  ('10000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000001', 1,
   'counseling', 'カウンセリング・医師診察',
   '20000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001',
   tstzrange(((now() at time zone 'Asia/Tokyo')::date + 1 + time '10:30') at time zone 'Asia/Tokyo',
             ((now() at time zone 'Asia/Tokyo')::date + 1 + time '11:00') at time zone 'Asia/Tokyo', '[)')),
  ('10000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000001', 2,
   'procedure', '施術(1回目)',
   '20000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001',
   tstzrange(((now() at time zone 'Asia/Tokyo')::date + 1 + time '11:00') at time zone 'Asia/Tokyo',
             ((now() at time zone 'Asia/Tokyo')::date + 1 + time '13:00') at time zone 'Asia/Tokyo', '[)'));
