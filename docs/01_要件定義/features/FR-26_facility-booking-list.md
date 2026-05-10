---
id: FR-26
title: 予約一覧（施設）
priority: P0
status: designed
related_users: [U-02, U-06]
related_screens: [SCR-47-facility-bookings]
related_features: [FR-22, FR-23, FR-24, FR-66]
version: 1
---

# FR-26: 予約一覧（施設）

## 概要
施設管理者（U-02）または法人管理者（U-06）が施設の予約一覧を閲覧する。承認待ちタスクが優先表示される。

## アクター
- U-02 施設管理者（自施設）
- U-06 法人管理者（配下施設、施設フィルタ可）

## 入力データ
| status | enum[] | × | - |
| date_range | date range | × | デフォルト 今月 |
| space_id | uuid | × | スペース絞り込み |
| nurse_id | uuid | × | 看護師絞り込み |
| facility_id | uuid | × | 法人管理者の場合のみ |

## 出力 / 結果
- 該当予約リスト
- 上部に「承認待ち件数」「指示医割当待ち件数」のサマリーバッジ
- 各カードに: 予約番号 / 看護師名 / スペース / 日時 / ステータス / 金額（按分後） / 担当指示医

## ビジネスルール
- BR-26-01: U-02 は自施設のみ。U-06 は配下全施設横断 + 施設絞り込み可。
- BR-26-02: 承認待ち（pending_approval）は優先表示。
- BR-26-03: SLA を超えた pending_approval（48h 接近）は警告色で強調。

## エラーケース
- 該当 0 件: ガイダンス表示

## 受入基準（AC）

### AC-26-01: 自施設の予約一覧
```gherkin
Given U-02 (facility=F-001)
And F-001 の予約 50 件
When 一覧画面を開く
Then F-001 の予約のみ表示
And 承認待ち件数バッジが表示
```

### AC-26-02: 承認待ち優先
```gherkin
Given pending_approval 5 件 + approved 20 件
When 一覧画面を開く
Then pending_approval が上部に集約表示
And 「承認 / 拒否」ボタンが各カードに表示
```

### AC-26-03: 法人横断
```gherkin
Given U-06 配下に F-001, F-002, F-003
When 一覧画面を開く
Then 3 施設の予約が混在表示
When 「F-001」フィルタ
Then F-001 のみ表示
```

### AC-26-04: SLA 警告
```gherkin
Given pending_approval が 47h 経過
Then 当該カードが警告色（赤系）で表示
And 「承認期限まであと 1h」が表示
```

## サブ機能
- FR-26-1: 施設・法人横断ビュー
- FR-26-2: 承認待ち優先表示
- FR-26-3: SLA 警告

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
