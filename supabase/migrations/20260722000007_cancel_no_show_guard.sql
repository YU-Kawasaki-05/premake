-- @implements v2-11 変更・キャンセル / v2-12 ステータス / v2-14 セッション
-- BC-NEW-03: cancel_booking RPC の status ガードに no_show(無断キャンセル)を追加する。
-- v2-12 では no_show は done と同じく終端状態であり、cancelled への遷移を禁止する。
-- 20260722000002 のガードは done/cancelled のみを弾いていたため、アプリ層の no_show チェックを
-- すり抜けた競合(pre-check 後に no_show 化)で cancelled 上書きが起きうる。ここで原子的に弾く。
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
declare
  v_status text;
begin
  update public.bookings
     set status        = 'cancelled',
         cancel_reason = p_reason,
         cancelled_at  = now()
   where id = p_booking_id
     and clinic_id = p_clinic_id
     and status not in ('done', 'cancelled', 'no_show');

  -- 0 行の場合は理由を判別する:
  --   既に cancelled  → 冪等成功(現行の「cancelled は ok:true」意味論を維持)
  --   done / no_show  → 終端状態はキャンセル不可(区別できる例外: 'booking % is %')
  --   不存在/テナント不一致/RLS 不可視 → no_data_found(現行踏襲)
  if not found then
    select status into v_status
      from public.bookings
     where id = p_booking_id
       and clinic_id = p_clinic_id;

    if not found then
      raise exception 'booking % not found for clinic %', p_booking_id, p_clinic_id
        using errcode = 'no_data_found';
    elsif v_status = 'cancelled' then
      return;
    else
      raise exception 'booking % is %', p_booking_id, v_status
        using errcode = 'no_data_found';
    end if;
  end if;

  update public.booking_sessions
     set status = 'cancelled'
   where booking_id = p_booking_id
     and status = 'scheduled';
end;
$$;

revoke all on function public.cancel_booking(uuid, uuid, text) from public;
grant execute on function public.cancel_booking(uuid, uuid, text) to authenticated, service_role;
