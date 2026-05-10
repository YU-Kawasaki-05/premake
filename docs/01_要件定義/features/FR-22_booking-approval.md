---
id: FR-22
title: 予約承認・拒否
priority: P0
status: designed
related_users: [U-02]
related_screens: [SCR-43-booking-approval]
related_features: [FR-21, FR-26, FR-28, FR-46]
version: 1
---

# FR-22: 予約承認・拒否

## 概要
施設管理者（U-02）が pending_approval の予約を承認または拒否する。承認で予約確定、指示医通知（FR-28）と決済予約（FR-38）が動く。

## アクター
- U-02 施設管理者（自施設）

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| booking_id | uuid | ○ | 自施設 |
| action | enum | ○ | "approve" / "reject" |
| 拒否理由 | string | × (rejectのみ必須) | 50〜1000 文字 |

## 出力 / 結果
- approve: `bookings.status=approved`、指示医通知（FR-28）、決済予約（Stripe Authorization）
- reject: `bookings.status=rejected`、看護師に拒否理由メール

## ビジネスルール
- BR-22-01: 承認 SLA は 48 時間（FR-21）。
- BR-22-02: 承認時に指示医アサインを再評価（担当時間帯ロジック、FR-18）。
- BR-22-03: 承認時に Stripe で **オーソリ** を取得（実決済は施術完了後 / FR-38）。オーソリ失敗時は承認不可、看護師にカード問題通知。
- BR-22-04: 拒否は理由必須。看護師には「拒否されました（理由）」メール。
- BR-22-05: 同一スペース・同時刻に複数 pending がある場合、先勝ち（先に approved されたものが確定、他は自動 rejected）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| Stripe オーソリ失敗 | 「カード認証に失敗しました」、看護師に通知 |
| 既に他予約に承認されている | 「この時刻は既に他予約に承認されています」 |

## 受入基準（AC）

### AC-22-01: 承認
```gherkin
Given pending_approval の予約 B-001
When U-02 が「承認」をクリック
Then bookings.status=approved
And Stripe Authorization が成立（amount_estimate）
And 指示医に通知（FR-28）
And 看護師に承認通知メール
```

### AC-22-02: 拒否
```gherkin
Given pending_approval の予約 B-001
When U-02 が「拒否」+ 理由「設備不備のため」を入力
Then bookings.status=rejected (reason=...)
And 看護師に拒否メール
```

### AC-22-03: 競合解決（先勝ち）
```gherkin
Given スペース S-001 の同時刻に 2 件の pending_approval 予約 B-001, B-002
When U-02 が B-001 を先に承認
Then B-001 は approved
And B-002 は自動 rejected (reason="他予約に承認済み")
And B-002 の看護師に通知
```

### AC-22-04: Stripe オーソリ失敗
```gherkin
Given pending の予約、看護師カードが期限切れ
When U-02 が「承認」
Then Stripe Authorization が失敗
And 「カード認証失敗のため承認できません」表示
And bookings.status は pending_approval のまま
And 看護師にカード更新依頼メール
```

## サブ機能
- FR-22-1: 承認・拒否
- FR-22-2: 競合解決（先勝ちロック）
- FR-22-3: Stripe オーソリ取得

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
