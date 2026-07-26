-- @implements v2-05 メニューのバッファ時間を枠占有・空き判定・重複防止に反映する(台帳 No.33)
--
-- 設計:
--   time_range     = 施術時間そのもの(表示用)。台帳・メールの「開始〜終了」はこれを使い、意味は変えない。
--   occupied_range = 施術時間 + バッファ(占有・空き判定・重複防止用)。清掃・器具準備の時間を含む。
-- time_range ⊆ occupied_range を CHECK で保証し、EXCLUDE 重複防止と availability を occupied_range に統一する。
-- これにより「procedure 120 + buffer 15」のメニューで施術終了直後に同室予約が入る問題を防ぐ。

alter table booking_sessions
  add column occupied_range tstzrange;

-- 既存行はバッファ未反映(= 施術時間のみ)なので time_range と同値で埋める
update booking_sessions
   set occupied_range = time_range;

alter table booking_sessions
  alter column occupied_range set not null;

-- 表示時間は占有時間に必ず包含される(バッファは施術の後ろにのみ付く)
alter table booking_sessions
  add constraint booking_sessions_time_within_occupied
  check (time_range <@ occupied_range);

-- 既存 EXCLUDE(time_range ベース)を occupied_range ベースに置換する。
-- where 句の status/room/member 条件は現行を踏襲し、time_range 条件のみ occupied_range に差し替える。
alter table booking_sessions
  drop constraint booking_sessions_room_overlap;
alter table booking_sessions
  drop constraint booking_sessions_staff_overlap;

alter table booking_sessions
  add constraint booking_sessions_room_overlap exclude using gist (room_id with =, occupied_range with &&)
    where (status = 'scheduled' and room_id is not null and occupied_range is not null);
alter table booking_sessions
  add constraint booking_sessions_staff_overlap exclude using gist (member_id with =, occupied_range with &&)
    where (status = 'scheduled' and member_id is not null and occupied_range is not null);

-- availability の空き検索用(occupied_range)。表示用の time_range gist インデックスは残す。
create index booking_sessions_clinic_occupied_idx on booking_sessions using gist (clinic_id, occupied_range);
