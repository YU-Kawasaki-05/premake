---
id: FR-72
title: 問診票記入
priority: P0
status: designed
related_users: [U-05]
related_screens: [SCR-123-questionnaire-fill]
related_features: [FR-29, FR-70, FR-71, FR-78]
version: 1
---

# FR-72: 問診票記入

## 概要
利用客（U-05）が予約後に問診票に回答する。回答結果は医師（U-03）が指示書発行（FR-29）時に確認。

## アクター
- U-05 利用客

## 入力データ
- 各質問への回答（テンプレートに従う、FR-71）
- アクセス: メール / SMS で届くトークン付き URL
- トークン検証: 有効期限 7 日、1 回限り（編集可）

## 出力 / 結果
- `customer_questionnaire_responses` レコード
- 関連 booking の questionnaire_status=submitted
- 看護師 / 指示医に通知

## ビジネスルール
- BR-72-01: 必須質問は全て回答必須。
- BR-72-02: アレルギーや既往歴の重大回答（陽性）は施術中止判断につながるため、医師確認を要する状態に。
- BR-72-03: 個人情報マスキング: 公開閲覧時はマスキング、医師 / 看護師 / 運営はフル閲覧可。
- BR-72-04: 7 年保存（医療記録）。
- BR-72-05: 編集は施術前まで可能。施術後の修正は追記のみ。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| トークン失効 | 「リンク期限切れ」+ 看護師に再発行依頼導線 |

## 受入基準（AC）

### AC-72-01: 正常記入
```gherkin
Given 利用客が問診票リンクから開く
When 全必須質問に回答 + 送信
Then customer_questionnaire_responses 作成
And questionnaire_status=submitted
And 看護師 / 指示医に通知
```

### AC-72-02: 重大回答（陽性）
```gherkin
Given 「妊娠の可能性 = はい」回答
Then 「医師確認後に施術可否判断」フラグ
And 看護師 / 指示医に高優先度通知
```

### AC-72-03: 編集（施術前）
```gherkin
Given 記入済み、施術前
When 利用客が再度リンクを開いて編集 + 送信
Then 既存レコードを上書き（編集履歴保持）
And 看護師に変更通知
```

### AC-72-04: 個人情報マスキング
```gherkin
When 別利用客が誤ってリンクにアクセス（不正）
Then トークン検証で別人だと検出
Then 403 / マスキング表示
```

## サブ機能
- FR-72-1: 記入フォーム
- FR-72-2: 重大回答ハイライト
- FR-72-3: 編集 / 履歴

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
