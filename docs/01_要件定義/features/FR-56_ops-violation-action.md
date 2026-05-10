---
id: FR-56
title: 運営: 違反検知・対応
priority: P0
status: designed
related_users: [U-04]
related_screens: [SCR-93-ops-violations]
related_features: [FR-11, FR-24, FR-40, FR-52, FR-55, FR-76]
version: 1
---

# FR-56: 運営: 違反検知・対応

## 概要
運営が違反・不正・規約逸脱に対して対応するワークフロー。アラート受信 → 調査 → 対応（警告 / 凍結 / 強制キャンセル / 返金等）。

## アクター
- U-04 運営

## 違反タイプ（β段階）
- アカウント不正使用（ログイン失敗連発、地理的異常）
- 大量キャンセル（看護師都合）
- 利用規約違反のレビュー（FR-52 連動）
- 施術記録の異常（指示書外施術等）
- 決済 dispute
- 法令違反の疑い（医師指示なしの施術等）

## 入力データ
| violation_id | uuid | ○ | アラートから |
| action | enum | ○ | "warning" / "suspend" / "force_cancel" / "refund" / "no_action" |
| 詳細メモ | string | ○ | 50〜5000 文字 |
| 通知方法 | enum | ○ | "email" / "phone_call" / "letter" |

## 出力 / 結果
- `violations` レコード作成（or 既存に追記）
- 対応に応じて FR-11 / FR-24 / FR-40 を実行
- 監査ログ
- 対象ユーザーへの通知

## ビジネスルール
- BR-56-01: 重大度に応じた SLA: 高（24h 以内）/ 中（3 営業日）/ 低（1 週間）。
- BR-56-02: 調査中はメモ付きでステータス更新。
- BR-56-03: 警告は累積 3 回で凍結検討。
- BR-56-04: 強制対応（凍結 / 返金）は 2 名以上の運営で承認制（重大決定）。

## 受入基準（AC）

### AC-56-01: 違反対応フロー
```gherkin
Given 違反アラート（看護師の 4 連続キャンセル）
When 運営が「警告」+ メールで対応
Then violations.action=warning, status=closed
And 対象に警告メール
And users.warning_count +1
```

### AC-56-02: 凍結 (2 名承認)
```gherkin
Given 重大違反案件
When 運営 X が「凍結」を提案
Then ステータス=承認待ち
When 運営 Y が承認
Then FR-11 凍結フローが実行される
```

### AC-56-03: 警告累積による凍結検討
```gherkin
Given 看護師 warning_count=3
Then 自動的に違反案件として運営キューに登録
And 「凍結検討」フラグ
```

## サブ機能
- FR-56-1: アラート受信
- FR-56-2: 調査ワークフロー
- FR-56-3: 二段階承認

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
