---
id: FR-24
title: 予約キャンセル
priority: P0
status: defined
related_users: [U-01, U-02, U-04]
related_screens: [SCR-45-booking-cancel]
related_features: [FR-21, FR-22, FR-40, FR-41, FR-86]
version: 1
---

# FR-24: 予約キャンセル

## 概要
看護師・施設・運営のいずれかが承認済み予約をキャンセルする。キャンセルポリシー（FR-41 + FR-86）に基づき返金・違約金が決まる。

## アクター
- U-01 看護師（自分の予約）
- U-02 施設管理者（自施設の予約）
- U-04 運営（全予約）

## 入力データ
| booking_id | uuid | ○ | - |
| reason | string | ○ | 50〜2000 文字 |
| cancel_actor | enum | ○ | "nurse" / "facility" / "ops" |

## 出力 / 結果
- `bookings.status=cancelled (cancelled_by=...)` に更新
- キャンセルポリシー判定 → 返金額算出
- Stripe オーソリ解除 or キャプチャ + 返金（FR-40）
- 関係者全員に通知メール

## ビジネスルール
- BR-24-01: キャンセル可能ステータス: pending_approval / approved / needs_doctor_assignment。施術完了後は不可。
- BR-24-02: キャンセルポリシー（FR-41 共通 / FR-86 施設別）:
  - 7 日前まで: 返金 100%
  - 3-7 日前: 返金 50%
  - 1-3 日前: 返金 30%
  - 24h 以内: 返金 0%
  - 施設都合キャンセル: 常に 100% 返金 + 看護師に補償（[仮決定]、Phase 2 で確定）
  - 運営強制キャンセル: 個別判断
- BR-24-03: キャンセル理由は監査ログに保存（FR-76）。
- BR-24-04: キャンセル率の高い看護師・施設は運営アラート対象（パターン検知、FR-56）。
- BR-24-05: 利用客の予約（FR-75）が紐付いている場合は連動キャンセル + 利用客通知。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 施術完了済み | 「施術完了済みのためキャンセルできません」 |
| 既に cancelled | 「既にキャンセル済みです」 |

## 受入基準（AC）

### AC-24-01: 看護師都合（7 日前以前）
```gherkin
Given approved 予約、施術まで 8 日
When U-01 がキャンセル
Then bookings.status=cancelled, cancelled_by=nurse
And キャンセル料 0% / 返金 100%
And Stripe オーソリ解除
And 関係者に通知
```

### AC-24-02: 看護師都合（24h 以内）
```gherkin
Given approved 予約、施術まで 12 時間
When U-01 がキャンセル
Then キャンセル料 100% / 返金 0%
And Stripe キャプチャ実行（料金確定）
```

### AC-24-03: 施設都合キャンセル
```gherkin
Given approved 予約
When U-02 がキャンセル（理由: スタッフ不在）
Then 常に返金 100%
And 看護師に補償（[仮決定]: 次回予約割引クーポン）
```

### AC-24-04: 運営強制キャンセル
```gherkin
Given 不正検知された予約
When U-04 がキャンセル（個別判断）
Then 任意の返金率を指定可能
And 監査ログに詳細記録
```

### AC-24-05: 利用客連動
```gherkin
Given 看護師の予約 B-001 に利用客の K カテゴリ予約 K-001 が紐付き
When U-01 が B-001 をキャンセル
Then K-001 も自動キャンセル
And 利用客にメール+SMS で通知
And 利用客の事前決済があれば返金処理
```

### AC-24-06: 連続キャンセル監視
```gherkin
Given U-01 が直近 30 日に 5 回の自己都合キャンセル
When 6 回目のキャンセル
Then 運営アラート発火（FR-56）
And U-04 が当該看護師の利用パターンをレビュー
```

## サブ機能
- FR-24-1: キャンセル実行
- FR-24-2: ポリシー適用 + 返金算出
- FR-24-3: 連動キャンセル（利用客）
- FR-24-4: 連続キャンセル監視

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
