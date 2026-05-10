---
id: FR-25
title: 予約一覧（看護師）
priority: P0
status: defined
related_users: [U-01]
related_screens: [SCR-46-nurse-bookings]
related_features: [FR-21, FR-22, FR-23, FR-24, FR-27, FR-65]
version: 1
---

# FR-25: 予約一覧（看護師）

## 概要
看護師（U-01）が自分の予約一覧を閲覧する。ステータス別タブ・期間フィルタ・検索を提供。

## アクター
- U-01 看護師

## 入力データ
| status | enum[] | × | "pending_approval" / "approved" / "completed" / "cancelled" 等 |
| date_range | date range | × | デフォルト 直近 90 日 |
| keyword | string | × | スペース名 / 施設名 / 利用客名 |
| sort | enum | × | "date_asc" / "date_desc" |

## 出力 / 結果
- 該当予約のリスト（カード or 表形式）
- 各カードに: 予約番号 / 日時 / スペース / ステータス / 金額 / 利用客（K カテゴリ紐付け） / 次のアクションリンク（承認待ち / 施術記録投入待ち / レビュー待ち）

## ビジネスルール
- BR-25-01: 自分の予約のみ表示（権限: U-01.user_id ベース）。
- BR-25-02: デフォルトは「進行中（pending/approved）」+「完了（直近 30 日）」。
- BR-25-03: 1 ページ 20 件、無限スクロール or ページング。

## エラーケース
- 該当 0 件: 「該当する予約はありません」+ 検索ヒント

## 受入基準（AC）

### AC-25-01: 一覧表示
```gherkin
Given U-01 が予約 30 件持つ
When 一覧画面を開く
Then 進行中 + 直近 30 日完了の予約が表示される
And 各カードに次のアクションリンクが表示
```

### AC-25-02: ステータスフィルタ
```gherkin
When 「キャンセル済み」タブをクリック
Then cancelled の予約のみ表示
```

### AC-25-03: 期間検索
```gherkin
When 期間「2026-04-01 - 2026-04-30」で検索
Then 当該期間の予約のみ表示
```

## サブ機能
- FR-25-1: フィルタ・検索
- FR-25-2: アクションリンク（次にやるべきタスク導線）

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
