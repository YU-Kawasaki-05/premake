---
id: FR-36
title: 看護師のカード登録
priority: P0
status: defined
related_users: [U-01]
related_screens: [SCR-60-card-register]
related_features: [FR-21, FR-38, FR-42]
version: 1
---

# FR-36: 看護師のカード登録

## 概要
看護師（U-01）がスペース利用料の決済用クレジットカードを登録する。Stripe Setup Intent でカード情報を Stripe に保管（PCI DSS 準拠、自前で保持しない）。

## アクター
- U-01 看護師

## 入力データ
- Stripe Elements 経由のカード情報入力（カード番号 / 有効期限 / CVC）
- カード名義人氏名

## 出力 / 結果
- Stripe customer + payment_method 作成
- `users.stripe_customer_id`, `users.default_payment_method_id` 保存
- カード自体の番号は当社 DB に保持しない

## ビジネスルール
- BR-36-01: PCI DSS 準拠のため、カード情報は Stripe Elements で扱い、自社サーバーには一切流さない。
- BR-36-02: 1 看護師に複数カード登録可、デフォルト 1 枚を選択。
- BR-36-03: カード期限切れ時は予約申込 (FR-21) を block + 更新を促す通知。
- BR-36-04: カード削除は予約進行中ならデフォルトカードに切替、それでも残予約に紐づくカードは「予約完了まで凍結」。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| Stripe エラー（カード拒否等） | エラーメッセージ表示、登録なし |
| 期限切れ | 「期限切れのカードです」 |

## 受入基準（AC）

### AC-36-01: 正常系
```gherkin
Given U-01 がカード登録画面
When 有効なカード情報を入力
Then Stripe Setup Intent 成功
And users.stripe_customer_id, default_payment_method_id 保存
And カード番号は当社 DB に存在しない
```

### AC-36-02: 複数カード管理
```gherkin
Given U-01 がカード A 登録済み
When カード B を追加登録
Then 2 枚登録される
When 「カード B をデフォルトに」をクリック
Then default_payment_method_id が B に更新
```

### AC-36-03: 期限切れカード
```gherkin
Given カードが期限切れ
When 予約申込 (FR-21) を試みる
Then エラー「カードの更新が必要です」
And カード更新画面に遷移
```

### AC-36-04: カード情報の DB 非保持
```gherkin
When DB を直接確認
Then users テーブルに card_number 列は存在しない
And 保持しているのは stripe_customer_id, default_payment_method_id のみ
```

## サブ機能
- FR-36-1: カード登録（Stripe Elements）
- FR-36-2: 複数カード管理
- FR-36-3: 期限切れ通知

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
