---
id: FR-23
title: 予約変更
priority: P0
status: designed
related_users: [U-01, U-02]
related_screens: [SCR-44-booking-modify]
related_features: [FR-21, FR-22, FR-24, FR-41, FR-88]
version: 1
---

# FR-23: 予約変更

## 概要
看護師（U-01）または施設管理者（U-02）が承認済み予約の日時・セッション内容を変更する。変更内容は一方の承認が必要。料金が変動する場合はオーソリ再取得。

## アクター
- U-01 看護師（自分の予約）
- U-02 施設管理者（自施設の予約）

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| booking_id | uuid | ○ | - |
| change_request | object | ○ | sessions / 想定メニュー / 利用目的 等 |
| 変更理由 | string | × | 1〜500 文字 |

## 出力 / 結果
- `booking_change_requests` レコード作成（status=pending）
- 相手側に通知 → 承認待ち
- 承認で `bookings` 更新 + 必要なら Stripe オーソリ再取得（料金差分）

## ビジネスルール
- BR-23-01: 変更は施術前のみ可能。施術完了後は変更不可（修正は施術記録 FR-33 経由）。
- BR-23-02: 施術 24 時間以内の変更は施設承認制（即時変更不可）。
- BR-23-03: 大幅な変更（時刻変更 / セッション数変更）は新規申込扱い。元予約は cancelled、新規 booking 作成。
- BR-23-04: 料金が増額する場合は新規 Authorization、減額する場合は差額をホールド解除。
- BR-23-05: 変更履歴は `booking_change_history` に保持。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 施術後の変更 | 「施術完了後は変更できません」 |
| 空き枠と衝突する変更 | 「指定時刻は予約済みです」 |

## 受入基準（AC）

### AC-23-01: 看護師からの軽微変更
```gherkin
Given approved 予約 B-001（施術 7 日後、セッション 14:00-16:00）
When U-01 が「想定メニュー: 眉 → 眉+リップ」に変更（料金変動なし）
Then booking_change_requests 作成
And U-02 に通知
When U-02 が承認
Then bookings 更新、看護師に承認通知
```

### AC-23-02: 時刻変更
```gherkin
Given approved 予約 B-001
When U-01 が「14:00-16:00 → 16:00-18:00」に変更申請
Then 変更後時刻の空き枠チェック → OK
And 料金再計算 → 同じ
And U-02 承認待ち
When U-02 承認
Then bookings 更新
```

### AC-23-03: 料金増額時のオーソリ
```gherkin
Given approved 予約（10000 円オーソリ済み）
When 時間延長で 15000 円に
Then 新規 Stripe Authorization 5000 円差分
And 旧 10000 円のホールド解除
```

### AC-23-04: 施術 24h 以内の変更
```gherkin
Given approved 予約、施術まで 12 時間
When U-01 が変更申請
Then 即時反映ではなく U-02 承認制
And U-02 に「24h 以内の変更依頼」高優先度通知
```

## サブ機能
- FR-23-1: 変更申請
- FR-23-2: 相手側承認
- FR-23-3: 料金差分処理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
