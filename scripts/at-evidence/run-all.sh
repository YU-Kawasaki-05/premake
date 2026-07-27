#!/usr/bin/env bash
# 受け入れテストの証跡を最初から通しで取り直す。
#   bash scripts/at-evidence/run-all.sh
# 前提: Docker(ローカル Supabase)が起動していること。dev サーバは本スクリプトが起動する。
set -uo pipefail
cd "$(dirname "$0")/../.."
LOG_DIR="${TMPDIR:-/tmp}/at-evidence"
mkdir -p "$LOG_DIR"

echo "== 1. データベースを初期状態へ =="
pnpm db:reset 2>&1 | tail -1
echo "== 2. 認証サービスの復帰を待つ(reset 直後は 502 を返すため) =="
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health)" = "200" ] && { echo "auth ready"; break; }
  sleep 2
done

echo "== 3. 開発サーバを起動 =="
pkill -f "next dev" 2>/dev/null; pkill -f next-server 2>/dev/null; sleep 2
pnpm dev > "$LOG_DIR/dev.log" 2>&1 &
DEV_PID=$!
for i in $(seq 1 40); do grep -q "Ready in" "$LOG_DIR/dev.log" 2>/dev/null && break; sleep 2; done
sleep 3

echo "== 4. メール本文の証跡を生成 =="
AT_EVIDENCE=1 pnpm exec vitest run tests/at-evidence-emails.test.ts 2>&1 | tail -3

echo "== 5. 各フェーズを順に実行 =="
FAILED=""
for s in phase-a-01-auth phase-a-02-master phase-a-03-booking phase-a-04-ops phase-a-05-notify \
         phase-b-01-public-page phase-b-02-availability phase-b-03-guest phase-b-04-manage \
         phase-c-01-setup phase-d-01-ops-legal phase-e-01-security phase-f-01-invite phase-g-01-audit-ops; do
  node "scripts/at-evidence/$s.mjs" > "$LOG_DIR/$s.log" 2>&1
  code=$?
  printf '%-28s exit=%s  %s\n' "$s" "$code" "$(grep -oE 'PASS=[0-9]+ PARTIAL=[0-9]+ NA=[0-9]+ FAIL=[0-9]+' "$LOG_DIR/$s.log" | tail -1)"
  [ "$code" != "0" ] && FAILED="$FAILED $s"
done

echo "== 6. 定期実行の認可(CRON_SECRET を設定した状態が必要) =="
kill $DEV_PID 2>/dev/null; pkill -f "next dev" 2>/dev/null; pkill -f next-server 2>/dev/null; sleep 2
SECRET="at-verify-$(openssl rand -hex 12)"
CRON_SECRET="$SECRET" NODE_ENV=production pnpm dev > "$LOG_DIR/dev-cron.log" 2>&1 &
for i in $(seq 1 40); do grep -q "Ready in" "$LOG_DIR/dev-cron.log" 2>/dev/null && break; sleep 2; done
sleep 3
AT_CRON_SECRET="$SECRET" node scripts/at-evidence/phase-a-06-cron-auth.mjs > "$LOG_DIR/phase-a-06.log" 2>&1
printf '%-28s exit=%s  %s\n' "phase-a-06-cron-auth" "$?" "$(grep -oE 'PASS=[0-9]+ PARTIAL=[0-9]+ NA=[0-9]+ FAIL=[0-9]+' "$LOG_DIR/phase-a-06.log" | tail -1)"
pkill -f "next dev" 2>/dev/null; pkill -f next-server 2>/dev/null; sleep 1

echo "== 7. 表示速度の参考計測(本番ビルド) =="
pnpm build > "$LOG_DIR/build.log" 2>&1 && pnpm start > "$LOG_DIR/start.log" 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3000/c/demo && break; sleep 2; done
sleep 2
node scripts/at-evidence/phase-d-02-perf.mjs > "$LOG_DIR/phase-d-02.log" 2>&1
printf '%-28s exit=%s  %s\n' "phase-d-02-perf" "$?" "$(grep -oE 'PASS=[0-9]+ PARTIAL=[0-9]+ NA=[0-9]+ FAIL=[0-9]+' "$LOG_DIR/phase-d-02.log" | tail -1)"
pkill -f next-server 2>/dev/null

echo "== 8. 報告書を生成 =="
node scripts/at-evidence/build-report.mjs
node scripts/at-evidence/p0-coverage.mjs 2>/dev/null || true

echo
echo "ログ: $LOG_DIR"
[ -n "$FAILED" ] && echo "非ゼロ終了:$FAILED" && exit 1
echo "すべてのフェーズが正常終了"
