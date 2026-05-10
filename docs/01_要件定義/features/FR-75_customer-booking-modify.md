---
id: FR-75
title: 予約変更・キャンセル（利用客）
priority: P0
status: designed
related_users: [U-05]
related_screens: [SCR-125-customer-modify]
related_features: [FR-24, FR-39, FR-41, FR-70, FR-74]
version: 1
---

# FR-75: 予約変更・キャンセル（利用客）

## 概要
利用客が予約照会（FR-74）後、自分の予約を変更・キャンセルする。看護師の予約（FR-23 / FR-24）と連動。

## アクター
- U-05 利用客

## 入力データ
### 変更
| 新しい日時 | datetime range | ○ | 看護師の空き枠から選択 |
| 変更理由 | string | × | 〜500 文字 |

### キャンセル
| キャンセル理由 | string | × | 〜500 文字 |

## 出力 / 結果
- 変更: customer_bookings 更新 + 看護師 / 関連 booking_session 更新
- キャンセル: customer_bookings.status=cancelled + 関連 booking_session.status=cancelled
- 事前決済済の場合は FR-41 ポリシーで返金

## ビジネスルール
- BR-75-01: 看護師の予約（B-XXX）と利用客予約（K-XXX）は連動。
  - 利用客がキャンセル → 該当 booking_session のみキャンセル（看護師の他客がいるなら看護師の予約は維持）
  - 利用客 1 人だけの予約 → 看護師の予約も連動キャンセル（看護師に通知）
- BR-75-02: キャンセルポリシー（FR-41）に従って返金率算出。
- BR-75-03: 変更は看護師の他客の予約と整合（同時刻ダブル予約不可）。
- BR-75-04: 利用客起因のキャンセルは看護師に即時通知。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 施術完了済 | 「キャンセル不可」 |
| 変更日時が空き枠外 | 「指定日時は受付不可」 |

## 受入基準（AC）

### AC-75-01: 単独利用客のキャンセル → 看護師連動
```gherkin
Given 看護師予約 B-001 の唯一の利用客 K-001
When K-001 を利用客がキャンセル
Then K-001.status=cancelled
And B-001 にも連動キャンセル提案を看護師に送信
```

### AC-75-02: 複数利用客中の 1 人キャンセル
```gherkin
Given B-001 に K-001, K-002 の 2 利用客
When K-001 のみキャンセル
Then K-001 のみ cancelled
And B-001 と看護師は維持
```

### AC-75-03: 事前決済の返金
```gherkin
Given K-001 が事前決済済（30000 円、施術 5 日前）
When 利用客がキャンセル（5 日前 → 50% 返金）
Then 15000 円 Stripe Refund
```

### AC-75-04: 変更
```gherkin
When 利用客が日時変更（看護師の空き枠内）
Then customer_bookings 更新
And 看護師に変更通知
```

## サブ機能
- FR-75-1: 変更
- FR-75-2: キャンセル + 連動処理
- FR-75-3: 返金処理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
