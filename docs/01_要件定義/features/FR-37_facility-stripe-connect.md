---
id: FR-37
title: 施設の Stripe Connect 連携
priority: P0
status: designed
related_users: [U-02, U-06]
related_screens: [SCR-61-stripe-connect]
related_features: [FR-09, FR-38, FR-44]
version: 1
---

# FR-37: 施設の Stripe Connect 連携

## 概要
施設または法人が Stripe Connect Express アカウントを連携する。スペース利用料の按分送金（プラットフォーム手数料控除後の残額が施設へ）に必要。

## アクター
- U-02 施設管理者（自施設）
- U-06 法人管理者（自法人配下）

## 入力データ
- Stripe Connect OAuth リダイレクト経由の認可
- 戻り値: connected_account_id

## 出力 / 結果
- `facilities.stripe_account_id` または `organizations.stripe_account_id` 保存
- 銀行口座 / 本人確認情報は Stripe 側で完結（Stripe Express Onboarding）

## ビジネスルール
- BR-37-01: 連携完了まで FR-22 予約承認時の Authorization が成立しない（送金先未定のため）。
- BR-37-02: Stripe 側で本人確認・口座確認が未完了の場合、定期同期で `payouts_enabled=false` を検出 → ダッシュボードに警告表示 + 通知。
- BR-37-03: 法人レベルの Connect アカウントを使う場合、配下施設は法人の Connect を共有（個別連携不要）。施設別連携と法人連携は排他。
- BR-37-04: 連携解除は可能だが、既予約完了まで送金先として保持（解除予約状態）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| Stripe Onboarding 中断 | 連携不完全、ダッシュボードに「連携を完了してください」 |
| 法人連携と施設連携の競合 | 「法人で連携済みです。施設での連携はできません」 |

## 受入基準（AC）

### AC-37-01: 施設の連携
```gherkin
Given facility (status=approved)
When U-02 が「Stripe 連携」をクリック
Then Stripe Express Onboarding にリダイレクト
When 入力完了して戻ってくる
Then facilities.stripe_account_id が保存
And payouts_enabled=true
```

### AC-37-02: 法人レベル連携
```gherkin
Given organizations (status=approved) 配下 3 施設
When U-06 が「法人で連携」を選択
Then organizations.stripe_account_id が保存
And 配下 3 施設は法人連携を共有
```

### AC-37-03: 連携未完了の警告
```gherkin
Given Stripe 側で payouts_enabled=false
When U-02 がダッシュボードを開く
Then 警告バナー「Stripe 連携を完了してください」
And 新規 spaces の publish が制限される
```

### AC-37-04: 連携解除
```gherkin
Given facility が連携済みで既予約 5 件あり
When U-02 が「連携解除」を試みる
Then 確認ダイアログ「既予約 5 件があります。完了まで送金先として保持されます」
When 確定
Then 連携状態は disconnect_pending に
And 既予約完了まで送金先として保持
```

## サブ機能
- FR-37-1: Stripe Connect OAuth
- FR-37-2: 法人レベル連携
- FR-37-3: 連携状態の同期・警告

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
