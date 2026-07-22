-- @implements v2-11 変更・キャンセル(リスケ: 日時・担当・部屋の一括変更)
--
-- (A) EXCLUDE 制約の DEFERRABLE 化(重要):
--   リスケは同一予約の複数セッションを 1 トランザクションで UPDATE する。行ごとに即時評価すると、
--   「session1 の新枠」が「session2 の旧枠」と自己衝突する。
--   例: 眉メニュー s1 10:00–10:30 / s2 10:30–12:30 を 30 分後ろへずらすと、
--       s1 新枠 10:30–11:00 が s2 旧枠(同室・同担当)と重なり、途中状態で 23P01 になる。
--   そこで両 EXCLUDE を `deferrable initially immediate` で作り直す。
--   INITIALLY IMMEDIATE のため通常の insert(createBooking)の挙動は不変(従来どおり即時評価)。
--   reschedule_booking の中でだけ `set constraints ... deferred` にしてコミット時評価へ切り替える。
--
-- (B) reschedule_booking RPC:
--   トランザクション冒頭で対象 2 制約を deferred にし、楽観ロックで status を検証、
--   p_sessions(seq 単位)の time_range/occupied_range/member_id/room_id を UPDATE する。
--   更新件数が p_sessions 件数と一致しなければ「セッション構成が変わった」競合として弾く。
--   コミット時(関数終了時)に EXCLUDE が評価され、他予約と衝突すれば 23P01 で全ロールバックする。

-- (A) 既存 EXCLUDE(20260722000003 の occupied_range ベース)を deferrable にして作り直す。
alter table booking_sessions
  drop constraint booking_sessions_room_overlap;
alter table booking_sessions
  drop constraint booking_sessions_staff_overlap;

alter table booking_sessions
  add constraint booking_sessions_room_overlap exclude using gist (room_id with =, occupied_range with &&)
    where (status = 'scheduled' and room_id is not null and occupied_range is not null)
    deferrable initially immediate;
alter table booking_sessions
  add constraint booking_sessions_staff_overlap exclude using gist (member_id with =, occupied_range with &&)
    where (status = 'scheduled' and member_id is not null and occupied_range is not null)
    deferrable initially immediate;

-- (B) リスケ RPC
--
-- SECURITY INVOKER(既定): 呼び出しロールの権限/RLS を継承する。
--   - 院内(authenticated): RLS が clinic_id によるテナント分離を継続して強制する。
--   - 公開(service_role): RLS をバイパスし、アプリ層のトークン検証で認可済み。
create or replace function public.reschedule_booking(
  p_booking_id      uuid,
  p_clinic_id       uuid,
  p_expected_status text,
  p_member_id       uuid,
  p_room_id         uuid,
  p_sessions        jsonb
) returns void
language plpgsql
as $$
declare
  v_status         text;
  v_expected_count int;
  v_updated_count  int := 0;
  v_row_count      int;
  v_session        jsonb;
begin
  -- 自己衝突(新枠 vs 旧枠)を避けるため、この Tx でのみ EXCLUDE をコミット時評価にする
  set constraints booking_sessions_room_overlap, booking_sessions_staff_overlap deferred;

  -- 楽観ロック: 現在ステータスを行ロック付きで取得し、期待と違えば競合として弾く
  select status into v_status
    from public.bookings
   where id = p_booking_id
     and clinic_id = p_clinic_id
   for update;
  if not found then
    raise exception 'booking % not found for clinic %', p_booking_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;
  if v_status <> p_expected_status then
    raise exception 'booking % status changed (expected %, got %)', p_booking_id, p_expected_status, v_status;
  end if;

  v_expected_count := jsonb_array_length(p_sessions);

  for v_session in select * from jsonb_array_elements(p_sessions)
  loop
    update public.booking_sessions
       set time_range     = (v_session->>'time_range')::tstzrange,
           occupied_range = (v_session->>'occupied_range')::tstzrange,
           member_id      = p_member_id,
           room_id        = p_room_id
     where booking_id = p_booking_id
       and seq = (v_session->>'seq')::int
       and status = 'scheduled';
    get diagnostics v_row_count = row_count;
    v_updated_count := v_updated_count + v_row_count;
  end loop;

  -- 更新できた scheduled セッション数が要求と合わない = 構成が別操作で変わった競合
  if v_updated_count <> v_expected_count then
    raise exception 'booking % status changed: session layout mismatch (expected %, updated %)',
      p_booking_id, v_expected_count, v_updated_count;
  end if;
end;
$$;

revoke all on function public.reschedule_booking(uuid, uuid, text, uuid, uuid, jsonb) from public;
grant execute on function public.reschedule_booking(uuid, uuid, text, uuid, uuid, jsonb) to authenticated, service_role;
