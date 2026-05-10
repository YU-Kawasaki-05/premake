---
id: FR-83
title: 配下施設の追加・編集・閉鎖
priority: P0
status: designed
related_users: [U-06, U-04]
related_screens: [SCR-31-org-facilities]
related_features: [FR-09, FR-13, FR-82, FR-84]
version: 1
---

# FR-83: 配下施設の追加・編集・閉鎖

## 概要
法人管理者（U-06）が配下施設を追加・編集・閉鎖する。各施設は通常の facility と同等の審査（FR-09）を受けるが、法人の信用情報を引き継ぐため審査が一部簡略化される。

## アクター
- U-06 法人管理者
- U-04 運営（個別 facility 審査）

## 入力データ
### 追加
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| facility プロフィール（FR-13） | object | ○ | FR-13 と同じ |
| 開設届情報（FR-09） | object | ○ | FR-09 と同じ |
| org_id | uuid | ○ | 自法人 |

### 閉鎖
| facility_id | uuid | ○ | 自法人配下 |
| 閉鎖理由 | string | ○ | 50〜2000 文字 |
| 閉鎖日 | date | ○ | 未来日付推奨 |
| 既予約の扱い | enum | ○ | "honor_until" / "cancel_all_with_refund" |

## 出力 / 結果
- 追加: facility 作成（status=pending_review、org_id=自法人）
- 編集: 通常の FR-13 と同じ
- 閉鎖: facility.status=closed、既予約は選択された方針で処理

## ビジネスルール
- BR-83-01: 法人 (FR-82) が approved でないと追加不可。
- BR-83-02: 配下施設の審査は通常の FR-09 を経るが、法人登記簿等の重複書類は省略可（[仮決定]）。
- BR-83-03: 閉鎖は閉鎖日まで予約受付停止、過去予約は保持。
- BR-83-04: 法人移管（別法人への譲渡）は P2 機能（β段階では運営オペで対応）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 法人未承認 | 「法人プロフィールの審査完了後に追加できます」 |
| 閉鎖日と既予約が衝突 | 「閉鎖日後に既予約があります。処理方針を選択してください」 |

## 受入基準（AC）

### AC-83-01: 配下施設追加
```gherkin
Given organizations (status=approved)
When U-06 が新規 facility を追加
Then facilities レコード作成 (org_id=自法人, status=pending_review)
And U-04 に通知メール
```

### AC-83-02: 一覧表示
```gherkin
Given 法人配下に 5 施設
When U-06 が「配下施設一覧」画面を開く
Then 5 施設の一覧（status / 稼働率 / 直近予約数）が表示される
```

### AC-83-03: 閉鎖（既予約あり）
```gherkin
Given facility F-005 が 2026-09-30 閉鎖予定
And 2026-10-15 に既予約 1 件
When U-06 が閉鎖を実行（既予約: cancel_all_with_refund）
Then 当該既予約が cancelled に更新
And FR-40 返金処理が自動キック
And facilities.status=closed (effective_at=2026-09-30)
```

## サブ機能
- FR-83-1: 配下施設追加
- FR-83-2: 配下施設一覧
- FR-83-3: 閉鎖処理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
