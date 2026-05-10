---
id: FR-51
title: レビュー一覧（β）
priority: P0
status: defined
beta: true
related_users: [U-01, U-02]
related_screens: [SCR-82-review-list]
related_features: [FR-20, FR-49, FR-50, FR-69]
version: 1
---

# FR-51: レビュー一覧（β）

## 概要
スペース・看護師のレビュー一覧。FR-20 / FR-69 から「全レビューを見る」リンクで遷移。

## アクター
- 全ユーザー（公開レビュー）
- 当事者（自分関連の private 含む）

## 入力データ
- target: { space_id | nurse_id }
- フィルタ: star_rating, date_range, sort

## 出力 / 結果
- レビュー一覧
- 平均評価サマリ + 評価分布グラフ
- 投稿者は伏せ字（「看護師の方より」「施設より」）

## ビジネスルール
- BR-51-01: 公開設定 public のみ表示（platform_only / private は除外）。
- BR-51-02: 投稿者個人特定情報は表示しない（イニシャル + 性別程度）。
- BR-51-03: 通報されたレビューは運営確認まで非表示（FR-52 と連動）。
- BR-51-04: 評価分布は ★1〜★5 件数分布。

## 受入基準（AC）

### AC-51-01: 公開レビューのみ表示
```gherkin
Given スペース S-001 にレビュー 12 件（public 8 / platform_only 3 / private 1）
When ユーザーが一覧を開く
Then 8 件のみ表示
And 平均評価とグラフが表示
```

### AC-51-02: 投稿者匿名化
```gherkin
When レビュー一覧を表示
Then 投稿者は「看護師 Y.K.」など伏せ字表記
And 個人特定不能
```

### AC-51-03: 通報レビュー
```gherkin
Given 1 件が通報されて運営確認待ち
Then 一覧から非表示
```

## サブ機能
- FR-51-1: フィルタ・ソート
- FR-51-2: 評価分布表示

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
