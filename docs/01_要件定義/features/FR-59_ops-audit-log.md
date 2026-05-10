---
id: FR-59
title: 運営: 監査ログ閲覧
priority: P0
status: defined
related_users: [U-04]
related_screens: [SCR-96-ops-audit]
related_features: [FR-76, FR-78]
version: 1
---

# FR-59: 運営: 監査ログ閲覧

## 概要
監査ログ収集基盤（FR-76）の出力を運営が検索・閲覧する。誰が、いつ、何をしたかを完全追跡。

## アクター
- U-04 運営

## 入力データ
| date_range | date range | ○ | - |
| actor_id | uuid | × | - |
| target_id | uuid | × | - |
| action_type | enum[] | × | login / record_view / refund / suspend 等 |
| keyword | string | × | - |

## 出力 / 結果
- ログエントリ（ts / actor / action / target / IP / UA / 詳細 JSON）
- 詳細クリックで関連エンティティへ deep link

## ビジネスルール
- BR-59-01: 監査ログは追記のみ、編集・削除不可（FR-76 と同一インフラ）。
- BR-59-02: 自分の閲覧アクションも監査ログに記録（運営の自己観察も追跡）。
- BR-59-03: 検索結果のエクスポートは FR-58 経由（PII 承認制）。
- BR-59-04: 7 年保存（医療データ周辺の法令準拠）。

## 受入基準（AC）

### AC-59-01: 検索
```gherkin
Given 運営アクション 1000 件
When 「actor=X + 期間=4 月」で検索
Then 該当ログが時系列降順
```

### AC-59-02: 閲覧の自己ログ
```gherkin
When 運営がログ画面を開く
Then 「運営 X が監査ログを閲覧」が当該ログに追加される
```

### AC-59-03: deep link
```gherkin
Given ログ「U-01 (id=...) の license image を閲覧」
When クリック
Then 当該 license 申請詳細にジャンプ
```

## サブ機能
- FR-59-1: 検索・フィルタ
- FR-59-2: deep link

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
