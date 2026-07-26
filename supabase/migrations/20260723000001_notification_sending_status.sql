-- @implements v2-23 通知送信の排他制御(ROB-03)
-- 監査由来: ROB-03 processQueue に排他制御が無く二重送信の窓がある
--
-- cron が重複起動(Vercel のリトライ等)しても同一通知を二重送信しないよう、
-- 送信前に status='queued' → 'sending' の条件付き UPDATE で行をクレームする。
-- クレームできた(1 行返った)プロセスだけが送信を担当する。
--
-- sending_at はクレーム時刻。notifications に updated_at が無いため、
-- 「送信中のままプロセスが落ちた行」を回収する基準として使う
-- (cron 冒頭で sending_at が 10 分より古い行を queued に戻す)。

alter table notifications
  drop constraint notifications_status_check;

alter table notifications
  add constraint notifications_status_check
  check (status in ('queued', 'sending', 'sent', 'failed'));

alter table notifications
  add column sending_at timestamptz;

-- キュー走査(status='queued')と stale 回収(status='sending')の両方が使う
create index notifications_status_idx on notifications (status, created_at);
