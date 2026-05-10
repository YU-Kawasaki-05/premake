---
id: FR-39
title: 利用客の事前決済
priority: P0
status: designed
related_users: [U-05]
related_screens: [SCR-62-customer-prepayment]
related_features: [FR-70, FR-72, FR-42]
version: 1
---

# FR-39: 利用客の事前決済（任意）

## 概要
利用客（U-05）が予約時に施術料を事前決済する。看護師ごとに「事前決済を要求/任意/不要」を設定可能（FR-69）。決済は看護師の Stripe customer ではなく、看護師の Connect 口座（β段階は看護師のスペース利用料とは別フロー）。

## アクター
- U-05 利用客

## 入力データ
- Stripe Elements でカード入力（ゲストとして）
- 金額（看護師が予約ページで提示）

## 出力 / 結果
- `customer_payments` レコード（amount, status, customer_email）
- 即時 Capture で完了（PaymentIntent confirm + capture）
- 看護師のダッシュボードに事前決済済みとして表示

## ビジネスルール
- BR-39-01: 利用客の決済はゲスト決済（Stripe customer は作るが、premake 内に user レコードは作らない、DEC-12）。
- BR-39-02: 事前決済の送金先は **看護師個人** の Stripe Connect Express（看護師がアートメイク事業者として連携、Phase 2 で詳細化）。
- BR-39-03: プラットフォーム手数料は事前決済額にも適用（[仮決定]: スペース利用料とは別の料率設定可、Phase 2 で確定）。
- BR-39-04: キャンセル時の返金は FR-41 のキャンセルポリシーに従う（看護師の取り分から控除）。
- BR-39-05: 事前決済は **任意** がデフォルト。看護師が設定で「必須」にすることも可（後払いは現金等で施術当日）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 看護師が Connect 未連携 | 「事前決済機能はまだご利用いただけません」、看護師に通知 |
| 決済失敗 | エラー表示、予約は仮確定 → 看護師に「決済失敗」通知 |

## 受入基準（AC）

### AC-39-01: 正常系（事前決済任意）
```gherkin
Given 看護師の予約ページ設定が「事前決済任意」
When 利用客が予約フォームで「事前決済する」を選択 + カード入力
Then customer_payments レコード作成
And Stripe PaymentIntent + capture 即時実行
And 予約に prepaid=true で紐付け
```

### AC-39-02: 事前決済必須
```gherkin
Given 看護師の予約ページ設定が「事前決済必須」
When 利用客が予約フォームで決済情報を入力しない
Then 「事前決済が必要です」エラー
And 予約は確定しない
```

### AC-39-03: 看護師 Connect 未連携
```gherkin
Given 看護師が Connect 未連携
When 利用客が予約フォームを開く
Then 事前決済セクションが disabled
And 看護師ダッシュボードに「Connect 連携で事前決済が利用可能に」表示
```

### AC-39-04: キャンセル時の返金
```gherkin
Given 利用客が予約 + 事前決済済（金額 30000 円）
When 利用客が施術 5 日前にキャンセル（FR-75）
Then キャンセルポリシーで返金率 50% が適用（[仮決定]）
And 15000 円が返金される
And 残り 15000 円は看護師の取り分（プラットフォーム手数料控除後）
```

### AC-39-05: 決済失敗時の予約状態
```gherkin
Given 利用客が予約 + 事前決済入力
When 決済が拒否される
Then 予約は payment_failed 状態で保留
And 利用客に「カード再入力」フォーム
And 24h 以内に決済完了しない場合は予約自動キャンセル
```

## サブ機能
- FR-39-1: ゲスト決済（Stripe）
- FR-39-2: 事前決済必須/任意切替
- FR-39-3: 失敗時保留と再試行

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
