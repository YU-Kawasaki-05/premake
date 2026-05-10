---
id: FR-44
title: 入金スケジュール表示
priority: P0
status: defined
related_users: [U-02, U-06]
related_screens: [SCR-66-payout-schedule]
related_features: [FR-37, FR-38, FR-43]
version: 1
---

# FR-44: 入金スケジュール表示

## 概要
施設・法人が Stripe Connect 経由の入金予定・履歴を確認する。Stripe API を一次ソースとして表示。

## アクター
- U-02 施設管理者
- U-06 法人管理者

## 入力データ
- date_range

## 出力 / 結果
- 入金予定一覧（予定日 / 金額 / 内訳予約 / ステータス）
- 入金履歴（着金済み / 失敗 / 保留）
- Stripe Dashboard へのリンク

## ビジネスルール
- BR-44-01: 一次ソースは Stripe Payouts API。表示時に同期取得（キャッシュ 5 分）。
- BR-44-02: 内訳には関連予約の予約番号・施術日を表示（追跡性）。
- BR-44-03: 入金失敗（口座不備等）は赤色強調 + 通知。
- BR-44-04: Stripe Dashboard へ deep link で詳細誘導（ユーザーが Stripe アカウント保有なら）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| Stripe API エラー | 「データ取得中」表示、リトライ |

## 受入基準（AC）

### AC-44-01: 入金予定表示
```gherkin
Given F-001 で確定済み Transfer 5 件（合計 50000 円）が次回 payout 予定
When U-02 が画面を開く
Then 入金予定: 2026-06-20 50000 円（5 件分）が表示
And 各予約への deep link
```

### AC-44-02: 入金履歴
```gherkin
Given 過去 3 ヶ月の入金 12 件
When 履歴ビュー
Then 12 件の履歴（日付 / 金額 / 着金状態）
```

### AC-44-03: 入金失敗
```gherkin
Given 1 件の入金が口座エラーで失敗
Then 赤色強調 + 「Stripe で口座情報を確認してください」表示
And 通知メールも送信済みであること
```

### AC-44-04: Stripe Dashboard 連携
```gherkin
When ユーザーが「詳細を Stripe で見る」をクリック
Then Stripe Express Dashboard の該当 Payout 詳細にリダイレクト
```

## サブ機能
- FR-44-1: Payouts API 連携
- FR-44-2: 内訳詳細
- FR-44-3: 失敗ハンドリング

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
