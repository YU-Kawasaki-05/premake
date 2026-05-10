---
id: FR-57
title: 運営: 返金処理画面
priority: P0
status: designed
related_users: [U-04]
related_screens: [SCR-94-ops-refund]
related_features: [FR-40, FR-42, FR-76]
version: 1
---

# FR-57: 運営: 返金処理画面

## 概要
運営が決済の返金を実行する画面。FR-40 のバックエンド機能をフロント化。承認制・監査ログ徹底。

## アクター
- U-04 運営

## 入力データ
| payment_id | uuid | ○ | - |
| refund_type | enum | ○ | "full" / "partial" |
| amount | int | ×（partial 時必須） | - |
| reason | string | ○ | 50〜5000 文字 |
| approval_required | boolean | × | 大口は二名承認 |

## 出力 / 結果
- FR-40 へ delegating
- 履歴は `refunds` + 監査ログ

## ビジネスルール
- BR-57-01: 大口返金（[仮決定]: 30000 円以上）は二名承認。
- BR-57-02: 返金理由は外部公開メールに反映 + 内部ログに完全保存。
- BR-57-03: 返金後の決算反映は会計システムへ FR-58 CSV 経由で渡す。

## 受入基準（AC）

### AC-57-01: 部分返金
```gherkin
Given payment 10000 円
When U-04 が「partial 4000 円 + 理由」入力 → 確認 → 実行
Then FR-40 が呼ばれる
And 履歴記録
```

### AC-57-02: 大口の二名承認
```gherkin
Given amount=50000 円の返金
When U-04 X が起票
Then U-04 Y の承認待ちになる
When Y 承認
Then 実行
```

### AC-57-03: 検索
```gherkin
When 運営が「期間 / 取引 ID / 看護師」で検索
Then 該当 payment が一覧
And 返金実行画面に遷移可
```

## サブ機能
- FR-57-1: 返金実行 UI
- FR-57-2: 二名承認フロー
- FR-57-3: 履歴検索

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
