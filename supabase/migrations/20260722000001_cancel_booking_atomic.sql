-- @implements v2-11 変更・キャンセル / v2-14 セッション
-- 予約キャンセルの原子化(BUG-03)。
-- ヘッダの cancelled 更新と未実施セッションの解放を分割 HTTP で行うと、
-- 片方成功・片方失敗で「キャンセル済みなのに枠(EXCLUDE)がロックされ再予約不能」になりうる。
-- 単一トランザクションの関数にまとめて原子性を保証する。
--
-- SECURITY INVOKER(既定): 呼び出しロールの権限/RLS を継承する。
--   - 院内(authenticated): RLS が clinic_id によるテナント分離を継続して強制する。
--   - 公開(service_role): RLS をバイパスし、アプリ層のトークン検証で認可済み。

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_clinic_id  uuid,
  p_reason     text default null
) returns void
language plpgsql
as $$
begin
  update public.bookings
     set status        = 'cancelled',
         cancel_reason = p_reason,
         cancelled_at  = now()
   where id = p_booking_id
     and clinic_id = p_clinic_id;

  -- 0 行(存在しない/テナント不一致/RLS で不可視)なら中断してロールバック
  if not found then
    raise exception 'booking % not found for clinic %', p_booking_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  update public.booking_sessions
     set status = 'cancelled'
   where booking_id = p_booking_id
     and status = 'scheduled';
end;
$$;

revoke all on function public.cancel_booking(uuid, uuid, text) from public;
grant execute on function public.cancel_booking(uuid, uuid, text) to authenticated, service_role;
