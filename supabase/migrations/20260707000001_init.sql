-- premake v2 initial schema
-- @implements v2-01..v2-26 (docs/10_v2_仕様/01_データモデル.md)

create extension if not exists btree_gist;

-- ---------------------------------------------------------------
-- helper schema
-- ---------------------------------------------------------------
create schema if not exists app;

-- トリガー関数(app.set_updated_at 等)と RLS ヘルパーを各ロールから実行可能にする
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- tenants / users
-- ---------------------------------------------------------------
create table clinics (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  director_name          text,
  postal_code            text,
  address                text,
  phone                  text,
  email                  text,
  business_hours         jsonb not null default '[]',
  public_booking_enabled boolean not null default false,
  booking_approval_mode  text not null default 'manual'
                         check (booking_approval_mode in ('auto','manual')),
  cancel_deadline_hours  integer not null default 24,
  settings               jsonb not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  is_ops     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clinic_members (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  user_id         uuid not null references profiles(id),
  roles           text[] not null default '{staff}'
                  check (roles <@ array['owner','doctor','staff']),
  employment_type text check (employment_type in ('employed','contracted')),
  display_name    text,
  is_bookable     boolean not null default false,
  status          text not null default 'active' check (status in ('active','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (clinic_id, user_id)
);

create table invitations (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  email           text not null,
  roles           text[] not null default '{staff}'
                  check (roles <@ array['owner','doctor','staff']),
  employment_type text check (employment_type in ('employed','contracted')),
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------
create table patients (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id),
  name              text not null,
  kana              text,
  birthdate         date,
  phone             text,
  email             text,
  external_chart_no text,
  notes             text,
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index patients_clinic_kana_idx  on patients (clinic_id, kana);
create index patients_clinic_phone_idx on patients (clinic_id, phone);
create index patients_clinic_email_idx on patients (clinic_id, email);

-- ---------------------------------------------------------------
-- questionnaire (templates defined before services to allow FK)
-- ---------------------------------------------------------------
create table questionnaire_templates (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id),
  name       text not null,
  questions  jsonb not null default '[]',
  status     text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- services / resources
-- ---------------------------------------------------------------
create table service_categories (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id),
  name       text not null,
  sort_order integer not null default 0
);

create table services (
  id                        uuid primary key default gen_random_uuid(),
  clinic_id                 uuid not null references clinics(id),
  category_id               uuid references service_categories(id),
  name                      text not null,
  description               text,
  kind                      text not null default 'treatment',
  price_yen                 integer,
  show_price                boolean not null default false,
  is_public                 boolean not null default false,
  allow_nomination          boolean not null default false,
  questionnaire_template_id uuid references questionnaire_templates(id),
  session_template          jsonb not null
    default '[{"kind":"procedure","label":null,"duration_min":60,"buffer_min":0}]',
  sort_order                integer not null default 0,
  status                    text not null default 'active' check (status in ('active','archived')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table staff_service_assignments (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id),
  member_id  uuid not null references clinic_members(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  unique (member_id, service_id)
);

create table rooms (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id),
  name       text not null,
  sort_order integer not null default 0,
  status     text not null default 'active' check (status in ('active','archived'))
);

create table clinic_closures (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  date      date not null,
  note      text,
  unique (clinic_id, date)
);

-- ---------------------------------------------------------------
-- schedule blocks (v2-08: 看護師の場所予約)
-- ---------------------------------------------------------------
create table schedule_blocks (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id),
  member_id  uuid not null references clinic_members(id),
  room_id    uuid not null references rooms(id),
  time_range tstzrange not null check (not isempty(time_range)),
  block_type text not null default 'open' check (block_type in ('open','blocked')),
  note       text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_blocks_room_overlap  exclude using gist (room_id with =, time_range with &&),
  constraint schedule_blocks_staff_overlap exclude using gist (member_id with =, time_range with &&)
);
create index schedule_blocks_clinic_time_idx on schedule_blocks using gist (clinic_id, time_range);

-- ---------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------
create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics(id),
  booking_no          text not null unique
                      default 'B-' || to_char(now() at time zone 'Asia/Tokyo', 'YYMMDD') || '-' ||
                              upper(substr(md5(gen_random_uuid()::text), 1, 4)),
  patient_id          uuid references patients(id),
  service_id          uuid not null references services(id),
  status              text not null default 'requested'
    check (status in ('requested','confirmed','checked_in','done','cancelled','no_show')),
  source              text not null default 'staff'
    check (source in ('web','phone','walk_in','staff')),
  nominated_member_id uuid references clinic_members(id),
  guest_name          text,
  guest_kana          text,
  guest_email         text,
  guest_phone         text,
  cancel_reason       text,
  cancelled_at        timestamptz,
  notes               text,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index bookings_clinic_status_idx on bookings (clinic_id, status, created_at desc);
create index bookings_patient_idx on bookings (patient_id);

create table booking_sessions (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id),
  booking_id        uuid not null references bookings(id) on delete cascade,
  seq               integer not null default 1,
  kind              text not null default 'procedure'
                    check (kind in ('counseling','procedure','retouch','other')),
  label             text,
  member_id         uuid references clinic_members(id),
  room_id           uuid references rooms(id),
  time_range        tstzrange check (time_range is null or not isempty(time_range)),
  status            text not null default 'scheduled'
                    check (status in ('scheduled','done','cancelled')),
  schedule_block_id uuid references schedule_blocks(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (booking_id, seq),
  constraint booking_sessions_room_overlap exclude using gist (room_id with =, time_range with &&)
    where (status = 'scheduled' and room_id is not null and time_range is not null),
  constraint booking_sessions_staff_overlap exclude using gist (member_id with =, time_range with &&)
    where (status = 'scheduled' and member_id is not null and time_range is not null)
);
create index booking_sessions_clinic_time_idx on booking_sessions using gist (clinic_id, time_range);
create index booking_sessions_booking_idx on booking_sessions (booking_id);

create table booking_access_tokens (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  token_hash text not null unique,
  purpose    text not null check (purpose in ('confirm','manage','questionnaire')),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index booking_access_tokens_booking_idx on booking_access_tokens (booking_id);

create table questionnaire_responses (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id),
  booking_id   uuid not null references bookings(id) on delete cascade,
  template_id  uuid not null references questionnaire_templates(id),
  answers      jsonb not null default '{}',
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index questionnaire_responses_booking_idx on questionnaire_responses (booking_id);

-- ---------------------------------------------------------------
-- notifications / jobs / audit
-- ---------------------------------------------------------------
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id),
  booking_id      uuid references bookings(id) on delete set null,
  recipient_type  text not null check (recipient_type in ('patient','member')),
  recipient_email text not null,
  kind            text not null,
  payload         jsonb not null default '{}',
  status          text not null default 'queued' check (status in ('queued','sent','failed')),
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);
create index notifications_clinic_idx on notifications (clinic_id, created_at desc);

create table worker_jobs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  payload    jsonb not null default '{}',
  run_at     timestamptz not null default now(),
  status     text not null default 'queued'
             check (status in ('queued','running','done','failed','dead')),
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index worker_jobs_status_run_idx on worker_jobs (status, run_at);

create table audit_logs (
  id            bigint generated always as identity primary key,
  clinic_id     uuid,
  actor_user_id uuid,
  actor_type    text not null check (actor_type in ('member','ops','guest','system')),
  action        text not null,
  target_type   text,
  target_id     uuid,
  diff          jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index audit_logs_clinic_idx on audit_logs (clinic_id, created_at desc);

-- ---------------------------------------------------------------
-- helper functions (security definer: RLS から参照)
-- ---------------------------------------------------------------
create or replace function app.is_ops()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ops from profiles where id = auth.uid()), false)
$$;

create or replace function app.is_clinic_member(_clinic_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = _clinic_id and user_id = auth.uid() and status = 'active'
  )
$$;

create or replace function app.has_role(_clinic_id uuid, _role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = _clinic_id and user_id = auth.uid() and status = 'active'
      and _role = any(roles)
  )
$$;

create or replace function app.shares_clinic_with(_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from clinic_members mine
    join clinic_members theirs on mine.clinic_id = theirs.clinic_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = _profile_id and theirs.status = 'active'
  )
$$;

-- updated_at 自動更新
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'clinics','profiles','clinic_members','patients','questionnaire_templates',
    'services','schedule_blocks','bookings','booking_sessions',
    'questionnaire_responses','worker_jobs'
  ] loop
    execute format(
      'create trigger %I before update on %I for each row execute function app.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

-- auth.users → profiles 自動作成
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------
-- RLS: デフォルト拒否。anon ポリシーは作らない(公開系は service role 経由)
-- ---------------------------------------------------------------
alter table clinics                   enable row level security;
alter table profiles                  enable row level security;
alter table clinic_members            enable row level security;
alter table invitations               enable row level security;
alter table patients                  enable row level security;
alter table questionnaire_templates   enable row level security;
alter table service_categories        enable row level security;
alter table services                  enable row level security;
alter table staff_service_assignments enable row level security;
alter table rooms                     enable row level security;
alter table clinic_closures           enable row level security;
alter table schedule_blocks           enable row level security;
alter table bookings                  enable row level security;
alter table booking_sessions          enable row level security;
alter table booking_access_tokens     enable row level security;
alter table questionnaire_responses   enable row level security;
alter table notifications             enable row level security;
alter table worker_jobs               enable row level security;
alter table audit_logs                enable row level security;

-- clinics
create policy clinics_select on clinics for select
  using (app.is_clinic_member(id) or app.is_ops());
create policy clinics_insert on clinics for insert
  with check (app.is_ops());
create policy clinics_update on clinics for update
  using (app.has_role(id, 'owner') or app.is_ops())
  with check (app.has_role(id, 'owner') or app.is_ops());

-- profiles
create policy profiles_select on profiles for select
  using (id = auth.uid() or app.shares_clinic_with(id) or app.is_ops());
create policy profiles_update on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- clinic_members
create policy clinic_members_select on clinic_members for select
  using (app.is_clinic_member(clinic_id) or app.is_ops());
create policy clinic_members_write on clinic_members for all
  using (app.has_role(clinic_id, 'owner') or app.is_ops())
  with check (app.has_role(clinic_id, 'owner') or app.is_ops());

-- invitations
create policy invitations_select on invitations for select
  using (app.has_role(clinic_id, 'owner') or app.is_ops());
create policy invitations_write on invitations for all
  using (app.has_role(clinic_id, 'owner') or app.is_ops())
  with check (app.has_role(clinic_id, 'owner') or app.is_ops());

-- テナント配下の業務テーブル(MVP: member 全員が read/write。運用で絞る場合は後続マイグレーション)
do $$
declare t text;
begin
  foreach t in array array[
    'patients','questionnaire_templates','service_categories','services',
    'staff_service_assignments','rooms','clinic_closures','schedule_blocks',
    'bookings','booking_sessions','questionnaire_responses'
  ] loop
    execute format(
      'create policy %I on %I for select using (app.is_clinic_member(clinic_id) or app.is_ops())',
      t || '_select', t
    );
    execute format(
      'create policy %I on %I for insert with check (app.is_clinic_member(clinic_id) or app.is_ops())',
      t || '_insert', t
    );
    -- with check で clinic_id 書き換え(クロステナント行移送)を防ぐ
    execute format(
      'create policy %I on %I for update using (app.is_clinic_member(clinic_id) or app.is_ops()) with check (app.is_clinic_member(clinic_id) or app.is_ops())',
      t || '_update', t
    );
    execute format(
      'create policy %I on %I for delete using (app.is_clinic_member(clinic_id) or app.is_ops())',
      t || '_delete', t
    );
  end loop;
end $$;

-- booking_access_tokens: サーバー(service role)専用。認証ユーザーへのポリシーなし。

-- notifications / audit_logs: member は自クリニック分を閲覧のみ(書き込みは service role)
create policy notifications_select on notifications for select
  using (app.is_clinic_member(clinic_id) or app.is_ops());
create policy audit_logs_select on audit_logs for select
  using (app.is_clinic_member(clinic_id) or app.is_ops());

-- worker_jobs: service role 専用(ポリシーなし)

-- ---------------------------------------------------------------
-- grants(RLS が行レベル制御を担う。anon はテーブル権限なし = 直接アクセス不可)
-- ---------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

-- 権限昇格防止(監査 CRITICAL): authenticated が自分の profiles.is_ops を書き換えて
-- プラットフォーム管理者になれないよう、更新可能列を限定する。
-- (RLS の with check は行単位で列を絞れないため、テーブル列権限で防ぐ)
revoke update on profiles from authenticated;
grant update (full_name, updated_at) on profiles to authenticated;
