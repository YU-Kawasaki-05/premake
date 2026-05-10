---
id: FR-40
title: 返金処理
priority: P0
status: designed
related_users: [U-04]
related_screens: [SCR-63-ops-refund]
related_features: [FR-24, FR-38, FR-39, FR-41, FR-42, FR-57, FR-76]
version: 1
---

# FR-40: 返金処理

## 概要
運営（U-04）が予約・利用客決済の返金を処理する。キャンセル時は FR-41 ポリシーで自動算出 → 自動実行 or 運営確認、不正検知時は手動の個別返金。

## アクター
- U-04 運営（手動）
- システム（自動、ポリシー適用時）

## 入力データ
| payment_id | uuid | ○ | - |
| amount | int | ○ | 全額または部分 |
| reason | string | ○ | 50〜2000 文字 |
| refund_actor | enum | ○ | "system" / "ops" |

## 出力 / 結果
- Stripe Refund 実行
- `refunds` レコード作成
- 関係者に通知メール
- 監査ログ（FR-76）に記録

## ビジネスルール
- BR-40-01: 返金は Stripe API 経由のみ。手動操作（外部送金）は禁止。
- BR-40-02: スペース利用料の返金は Capture 前ならオーソリ解除、Capture 後なら refund + Transfer の reverse。
- BR-40-03: 利用客事前決済の返金は同様に PaymentIntent refund。
- BR-40-04: 部分返金可。残額は通常通り進行。
- BR-40-05: 返金理由は必須。監査ログに保存。
- BR-40-06: 手数料（プラットフォーム手数料）の扱い:
  - 看護師都合キャンセル: プラットフォーム手数料は施設へ補償として送金 ([仮決定])
  - 施設都合キャンセル: プラットフォーム手数料は看護師に返金
  - 運営都合: 個別判断
- BR-40-07: 返金完了通知は当事者全員に送信。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| Stripe Refund 失敗 | リトライ、3 回失敗で運営アラート + 手動介入 |
| 既に返金済み | 「全額返金済みです」 |

## 受入基準（AC）

### AC-40-01: 自動返金（キャンセルポリシー）
```gherkin
Given 予約キャンセル (FR-24, 7 日前以前)
And 返金 100% / 1 万円
When 自動返金ジョブ実行
Then Stripe Refund 1 万円
And refunds レコード作成、reason=cancellation_policy
And 看護師にメール
```

### AC-40-02: 運営による手動返金
```gherkin
Given 不正検知 case
When U-04 が「個別返金 5000 円」+ 理由「サービス不具合補償」
Then Stripe Refund 5000 円
And 監査ログに詳細記録
```

### AC-40-03: Capture 後の Transfer reversal
```gherkin
Given 予約完了済（Capture 済、施設へ Transfer 済）
When 返金実行
Then Stripe Refund + Transfer reversal の両方を実行
And 整合性確認 (FR-42 Webhook で二重チェック)
```

### AC-40-04: 部分返金
```gherkin
Given amount=10000 の payment
When U-04 が部分返金 4000 円
Then refunds に 4000 円 INSERT
And payments.refunded_amount=4000 に更新
And 残 6000 円は完了状態維持
```

### AC-40-05: Refund 失敗時のフォロー
```gherkin
Given Stripe Refund が一時的失敗
Then 指数バックオフで最大 3 回リトライ
When 3 回全失敗
Then 運営アラート、手動 Stripe Dashboard 操作待ち
And 関係者に「処理中」通知（不安にしない文言）
```

## サブ機能
- FR-40-1: 自動返金（ポリシー連動）
- FR-40-2: 手動返金
- FR-40-3: 部分返金
- FR-40-4: Transfer reversal

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
