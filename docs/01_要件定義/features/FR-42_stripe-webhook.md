---
id: FR-42
title: Stripe Webhook 受信・整合性確認
priority: P0
status: designed
related_users: []
related_screens: []
related_features: [FR-38, FR-39, FR-40, FR-77]
version: 1
---

# FR-42: Stripe Webhook 受信・整合性確認

## 概要
Stripe からの Webhook（payment_intent.succeeded, charge.refunded, transfer.failed, account.updated 等）を受信し、内部 DB との整合性を確認・更新する。

## アクター
- システム

## 処理対象イベント（β段階）
- `payment_intent.created / .succeeded / .canceled / .payment_failed`
- `charge.captured / .refunded / .dispute.created`
- `transfer.created / .reversed / .failed`
- `account.updated` (Connect 状態変化)
- `setup_intent.succeeded`
- `customer.updated / .deleted`
- `invoice.payment_failed` (β後の定額課金導入時)

## ビジネスルール
- BR-42-01: Webhook エンドポイントは署名検証必須（Stripe Signing Secret）。検証失敗は 400。
- BR-42-02: 冪等性: 同一 event.id は 1 回のみ処理（`stripe_events` テーブルで管理）。
- BR-42-03: Webhook 処理は **2xx を即時返却** し、重い処理はバックグラウンドジョブ（FR-77）にキュー投入。
- BR-42-04: 内部 DB と Stripe の状態が乖離した場合、定期同期ジョブ（5 分ごと）で修復。
- BR-42-05: 重要イベント（dispute / refund / transfer.failed）は運営 Slack/メール即時通知。
- BR-42-06: Webhook 処理失敗（DB エラー等）は dead letter queue に退避、運営アラート。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 署名検証失敗 | 400 |
| event.id 重複 | 200（冪等成功）、再処理しない |
| 内部エラー | 500、Stripe が自動リトライ（最大 3 日） |

## 受入基準（AC）

### AC-42-01: payment_intent.succeeded 受信
```gherkin
Given Stripe から payment_intent.succeeded 受信
When 署名検証 OK
Then payments.status を captured に更新
And stripe_events に event.id 保存
And 200 即時返却
And Capture 後の Transfer ジョブをキュー投入
```

### AC-42-02: 冪等性
```gherkin
Given 同一 event.id を 2 回受信
Then 1 回目: 通常処理、stripe_events に保存
And 2 回目: 既に存在 → 処理スキップ、200
```

### AC-42-03: 署名検証失敗
```gherkin
Given 署名 invalid な Webhook 受信
Then 400 を返す
And 監査ログに不正受信を記録（IP 含む）
```

### AC-42-04: dispute 即時通知
```gherkin
Given charge.dispute.created 受信
Then 運営 Slack/メール即時通知
And 該当 payment / booking を凍結状態にマーク
And ダッシュボードでアラート表示
```

### AC-42-05: 状態乖離の自動修復
```gherkin
Given 内部 payments.status=authorized
And 5 分後の同期で Stripe 側は captured
Then 同期ジョブが乖離を検出 → 内部 status を captured に修正
And 監査ログに「auto-reconcile」記録
And 運営にも通知（軽度）
```

### AC-42-06: dead letter queue
```gherkin
Given 受信処理が DB エラーで失敗
Then dead letter queue に退避
And 運営アラート
When 運営が DB 修復後に再処理
Then DLQ から取り出し → 通常処理 → 完了
```

## サブ機能
- FR-42-1: Webhook 受信・署名検証
- FR-42-2: 冪等処理
- FR-42-3: 状態同期ジョブ
- FR-42-4: Dead Letter Queue

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
