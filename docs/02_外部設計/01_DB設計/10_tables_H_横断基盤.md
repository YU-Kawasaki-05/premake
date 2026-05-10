# DB 設計 — H. 横断基盤

> [00_index.md](00_index.md) に戻る

## TBL-worker_jobs — バックグラウンドジョブ（DEC-26）
**関連機能**: FR-77

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| job_type | VARCHAR(50) | NO | send_email / capture_payment / send_sms / generate_pdf / etc |
| payload | JSONB | NO | |
| status | VARCHAR(20) | NO | pending / running / succeeded / failed / dead |
| priority | SMALLINT | NO | 0 (low) - 100 (critical) |
| scheduled_at | TIMESTAMPTZ | NO | 実行予定時刻 |
| started_at | TIMESTAMPTZ | YES | |
| completed_at | TIMESTAMPTZ | YES | |
| retry_count | SMALLINT | NO | 0 |
| max_retries | SMALLINT | NO | 6 |
| last_error | TEXT | YES | |
| idempotency_key | VARCHAR(200) | NO | UNIQUE |
| locked_by | VARCHAR(100) | YES | worker instance ID |
| locked_until | TIMESTAMPTZ | YES | |
| created_at | TIMESTAMPTZ | NO | |

**インデックス**:
- `UNIQUE (idempotency_key)`
- `INDEX (status, priority DESC, scheduled_at) WHERE status='pending'` — ワーカーの取得クエリ
- `INDEX (status, completed_at)` — 監視 / クリーンアップ

> ワーカーは `FOR UPDATE SKIP LOCKED` パターンでジョブ取得（[01_設計方針.md §10](01_設計方針.md)）。

---

### worker_jobs の代表的な job_type 一覧

| job_type | 用途 | 関連 FR |
|---|---|---|
| send_email | Resend で送信 | FR-46 |
| send_sms | Twilio で送信 | FR-47 |
| stripe_capture | 決済 capture | FR-38 |
| stripe_transfer | 施設へ送金 | FR-38 |
| stripe_refund | 返金 | FR-40 |
| generate_prescription_pdf | 指示書 PDF 生成 | FR-30 |
| generate_consent_pdf | 同意書 PDF 生成 | FR-32 |
| auto_cancel_pending_booking | 48h 承認待ち自動キャンセル | FR-21 |
| reminder_24h_before_treatment | 24h 前リマインド | FR-28 |
| reminder_1h_before_treatment | 1h 前リマインド | FR-28 |
| escalate_unprescribed | 30 分前未発行エスカレーション | FR-28 |
| reauthorize_payment | Authorization 期限切れ再オーソリ | FR-38 |
| compute_monthly_revenue | 月次集計 | FR-43 |
| audit_log_chain_verify | 監査ログ整合性検証 | FR-76 |
| reconcile_stripe | Stripe 状態同期 | FR-42 |
| export_csv | 大規模 CSV 生成 | FR-58 |
| send_announcement | お知らせ一斉配信 | FR-60 |
| invitation_expiry | 招待トークン期限切れ処理 | FR-02 |
| password_reset_expiry | リセットトークン期限切れ | FR-05 |

---

## TBL-feature_flags — フィーチャーフラグ
**関連機能**: FR-79

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NO | PK |
| key | VARCHAR(100) | NO | UNIQUE |
| description | TEXT | YES | |
| kind | VARCHAR(20) | NO | release / experiment / kill / config |
| strategy | JSONB | NO | {type: 'all'/'percentage'/'specific_users', value: ...} |
| value | JSONB | YES | 設定フラグの場合の値（例: 手数料率） |
| enabled | BOOLEAN | NO | true |
| created_at | TIMESTAMPTZ | NO | |
| updated_at | TIMESTAMPTZ | NO | |

**インデックス**: `UNIQUE (key)`

---

## TBL-system_health_events — ヘルスチェック記録
**関連機能**: FR-80

| カラム | 型 | NULL | 説明 |
|---|---|---|---|
| id | BIGSERIAL | NO | PK |
| service | VARCHAR(50) | NO | api / db / stripe / resend / twilio / storage / job |
| status | VARCHAR(20) | NO | ok / degraded / outage |
| latency_ms | INTEGER | YES | |
| message | TEXT | YES | |
| ts | TIMESTAMPTZ | NO | now() |

**インデックス**: `INDEX (service, ts DESC)` — 最新状態取得

---

[← 09_tables_G_運営監査.md](09_tables_G_運営監査.md) | [次: 11_マイグレーション.md →](11_マイグレーション.md)
