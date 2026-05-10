---
id: FR-38
title: スペース利用料の決済（按分）
priority: P0
status: designed
related_users: []
related_screens: []
related_features: [FR-15, FR-22, FR-34, FR-37, FR-42, FR-44]
version: 1
---

# FR-38: スペース利用料の決済（按分）

## 概要
予約承認 (FR-22) でオーソリ取得、施術記録確認 (FR-34) でキャプチャ実行、Stripe Connect 経由で施設へ送金、プラットフォーム手数料を控除。

## アクター
- システム（自動）

## トリガー
- 予約承認時: Authorization 取得
- 施術記録確認時: Capture 実行 + 按分送金
- キャンセル時: Authorization 解除 or 部分返金 (FR-40)

## 入力データ
- booking_id, amount_estimate, stripe_customer_id (看護師), stripe_account_id (施設)
- platform_fee_rate（[仮決定]: 15%）

## 出力 / 結果
- `payments` レコード（intent_id, amount, status, captured_at, transferred_at）
- Stripe PaymentIntent + Transfer の整合性管理

## ビジネスルール
- BR-38-01: 承認時に Authorization (manual capture)、確認時に Capture。
- BR-38-02: Capture 時に Stripe Transfer で施設の connected_account へ手数料控除後の額を送金。
- BR-38-03: プラットフォーム手数料は `Math.floor(amount * 0.15)` で計算。剰余は施設取り分（[仮決定]）。
- BR-38-04: 消費税は内税表記。Stripe 手数料は別途プラットフォーム負担（[仮決定]）。
- BR-38-05: 送金タイミングは Stripe のデフォルトスケジュール（通常 7 日後）。施設 dashboard で確認可（FR-44）。
- BR-38-06: Webhook (FR-42) で全ステータス遷移を二重確認。
- BR-38-07: 二重キャプチャ防止のため idempotency_key を必ず使用。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| Authorization 期限切れ（7 日経過） | 再 Authorization、看護師に通知 |
| Capture 失敗 | リトライ、3 回失敗で運営アラート |
| Transfer 失敗 | リトライ、施設の Stripe 問題なら通知 |

## 受入基準（AC）

### AC-38-01: 承認時オーソリ
```gherkin
Given 予約 B-001 (amount=10000)
When U-02 が承認 (FR-22)
Then Stripe Authorization 10000 円取得
And payments.status=authorized
```

### AC-38-02: 施術確認時キャプチャ + 送金
```gherkin
Given 施術記録 R-001 が confirmed (FR-34)
When 決済確定ジョブが走る
Then Stripe Capture 10000 円
And Stripe Transfer 8500 円が施設へ
And payments.status=captured, transferred
And platform_fee=1500 が `platform_revenue` に記録
```

### AC-38-03: 二重キャプチャ防止
```gherkin
Given Capture ジョブが何らかの理由で 2 回起動
Then 2 回目は idempotency_key で同一として扱われる
And Stripe 側でも 1 回のみキャプチャされる
And payments レコードは 1 件のまま
```

### AC-38-04: Authorization 期限切れ
```gherkin
Given approved 予約、施術が 8 日後（オーソリ 7 日 SLA 超過の前日）
When 自動再オーソリジョブ
Then 新規 Authorization 取得
And 旧 Authorization 解除
And payments に履歴として記録
```

### AC-38-05: Capture 失敗時のリトライ
```gherkin
Given Capture が一時的失敗（ネットワーク等）
Then 指数バックオフでリトライ（最大 3 回）
When 3 回全失敗
Then 運営アラート（FR-56）
And 手動介入待ち
```

## サブ機能
- FR-38-1: Authorization
- FR-38-2: Capture
- FR-38-3: Transfer（按分送金）
- FR-38-4: 期限切れ再オーソリ

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
