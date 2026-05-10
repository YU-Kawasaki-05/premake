---
id: FR-50
title: 施設→看護師レビュー（β）
priority: P0
status: defined
beta: true
related_users: [U-02]
related_screens: [SCR-81-review-form]
related_features: [FR-21, FR-49, FR-51, FR-52]
version: 1
---

# FR-50: 施設→看護師レビュー（β）

## 概要
施術完了後、施設管理者が看護師を 5 段階評価 + コメント。β表記。

## アクター
- U-02 施設管理者

## 入力データ
FR-49 と同構造。カテゴリ別評価:
- 清潔さ / 時間厳守 / コミュニケーション / 施術品質（外形観察）

公開設定:
- "public" → 看護師の公開ページ FR-69 に表示
- "platform_only" → 検索結果 FR-19 のスコアに反映、テキスト非公開
- "private" → 施設内メモ

## ビジネスルール
- BR-50-01: completed 予約 + 施術記録投入済みのみ。
- BR-50-02: その他は FR-49 と同等。
- BR-50-03: 看護師の「平均評価」は他施設からの全レビューを集計（公開済みのみ）。

## エラーケース
FR-49 と同様

## 受入基準（AC）

### AC-50-01: 投稿
```gherkin
Given completed + 施術記録あり
When U-02 が ★5 + コメント「とても丁寧でした」公開
Then reviews 作成
And 看護師の平均評価更新
```

### AC-50-02: platform_only 設定
```gherkin
When U-02 が「platform_only」で投稿
Then 検索スコア（重み付け）に反映
And テキストは公開されない
```

## サブ機能
- FR-50-1〜3: FR-49 と同構造

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
