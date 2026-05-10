---
id: FR-11
title: アカウント凍結・復活
priority: P0
status: defined
related_users: [U-04]
related_screens: [SCR-15-ops-suspend]
related_features: [FR-04, FR-46, FR-56, FR-76]
version: 1
---

# FR-11: アカウント凍結・復活

## 概要
運営（U-04）がユーザー（U-01〜U-03, U-06）のアカウントを凍結・復活する。凍結後はログイン不可、進行中の予約・施術記録の取り扱いは個別対応（運営判断）。

## アクター
- U-04 運営

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| user_id | uuid | ○ | 対象ユーザー |
| action | enum | ○ | "suspend" / "unsuspend" |
| reason | string | ○ | 50〜2000 文字 |
| effective_at | datetime | × | デフォルト即時 |
| 進行中予約の扱い | enum | × | "cancel_all" / "keep_ongoing" / "review_each" |

## 出力 / 結果
- `users.status` を `active ↔ suspended` で更新
- 凍結時は当該ユーザーの全セッションを破棄
- 通知メール（FR-46）を当該ユーザーに送信
- 監査ログ（FR-76）に記録

## ビジネスルール
- BR-11-01: 凍結中はログイン不可（FR-04 で stop）。
- BR-11-02: 凍結時に進行中の予約・施術記録の扱いを選択：
  - cancel_all: 全予約をキャンセル + 通常返金フロー（FR-40）
  - keep_ongoing: 完了予定日まで保持、新規予約のみブロック
  - review_each: 予約ごとに運営が個別判断（デフォルト）
- BR-11-03: 凍結・復活は監査ログ必須。理由は必ず記録。
- BR-11-04: 凍結中も施術記録（既往）は閲覧可能（医療記録の保存義務）。
- BR-11-05: 復活時は復活理由と承認者（U-04）を記録。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 既に同状態 | 「既に suspend/active 状態です」 |
| 理由が短すぎる | 「理由は 50 文字以上で入力してください」 |

## 受入基準（AC）

### AC-11-01: 凍結
```gherkin
Given U-01 が status=active
When U-04 が「凍結」+ 理由「免許の不正報告あり」+ 進行中予約「review_each」を選択
Then users.status=suspended に更新
And 当該 U-01 の全セッションが無効化
And 当該 U-01 にメール「アカウント凍結のお知らせ」が送信
And 監査ログに suspended が記録（reason 含む）
```

### AC-11-02: 復活
```gherkin
Given U-01 が suspended
When U-04 が「復活」+ 理由「審査完了、誤報と判明」を選択
Then users.status=active に更新
And ログイン可能になる
And 当該 U-01 にメール通知
```

### AC-11-03: 凍結中のログインブロック
```gherkin
Given U-01 が suspended
When 正しいパスワードでログイン
Then エラー「アカウントが停止されています」表示
And セッションは発行されない
```

### AC-11-04: 進行中予約の cancel_all
```gherkin
Given U-01 が 3 件の予約（status=approved）を持つ
When U-04 が凍結 + 進行中予約「cancel_all」を選択
Then 3 件全て status=cancelled に更新
And FR-40（返金処理）が自動キックされる
And 各予約の関係者（施設・指示医）に通知
```

### AC-11-05: 凍結中の施術記録閲覧
```gherkin
Given U-01 が suspended、過去施術記録 5 件あり
When U-03 指示医や U-04 運営が施術記録閲覧
Then 閲覧可能（医療記録保存義務のため）
But U-01 本人は新規記録投入不可
```

## サブ機能
- FR-11-1: 凍結 / 復活
- FR-11-2: 進行中予約の自動処理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
