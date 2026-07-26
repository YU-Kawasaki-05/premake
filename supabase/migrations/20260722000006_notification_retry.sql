-- @implements v2-23/v2-24 通知送信失敗のリトライ(No.20)
-- 監査由来: No.20 メール送信失敗のリトライなし(通知が恒久消失)
--
-- notifications に試行回数 attempts を持たせ、cron(/api/cron processQueue)が
-- 送信失敗時に attempts をインクリメントする。上限(3)未満なら status='queued' のまま
-- 残し次回 cron で自動再送、上限到達で status='failed'(恒久)に落とす。
-- 無限再送は attempts 上限で防ぐ(queued 取得条件は現状維持)。

alter table notifications
  add column attempts integer not null default 0;
