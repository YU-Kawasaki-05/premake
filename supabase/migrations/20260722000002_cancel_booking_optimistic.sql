-- @implements v2-11 変更・キャンセル / v2-14 セッション
-- キャンセル RPC の楽観ロック(BC-NEW-01)。
-- 20260722000001 の cancel_booking はヘッダ UPDATE が status 無条件だったため、
-- アプリ層の done チェック後に別操作で done になっても RPC が cancelled_at 等を上書きし、
-- 「完了済みなのに枠解放済み・cancelled_at 残存」等の不整合が起きうる。
-- UPDATE 条件に status ガード(done/cancelled を除外)を加えて原子的に競合を弾く。
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
     and status not in ('done', 'cancelled');

  -- 0 行の場合は理由を判別する:
  --   既に cancelled  → 冪等成功(現行の「cancelled は ok:true」意味論を維持)
  --   done            → 完了済みはキャンセル不可(区別できる例外)
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
