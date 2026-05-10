---
id: FR-34
title: 施術記録の確認・承認
priority: P0
status: designed
related_users: [U-03]
related_screens: [SCR-56-record-review]
related_features: [FR-33, FR-38, FR-67, FR-77]
version: 1
---

# FR-34: 施術記録の確認・承認

## 概要
指示医（U-03）が看護師の施術記録を確認・承認する。承認で医療記録として確定し、決済確定（FR-38）がトリガーされる。

## アクター
- U-03 指示医（担当した予約）

## 入力データ
| treatment_record_id | uuid | ○ | - |
| action | enum | ○ | "confirm" / "request_revision" |
| コメント | string | × | revision 時必須 |

## 出力 / 結果
- confirm: `treatment_records.status=confirmed, confirmed_at, confirmed_by` 更新
- revision: `status=revision_requested`、看護師に通知 → 修正記録追記
- 確定後、決済確定（FR-38）が自動キック

## ビジネスルール
- BR-34-01: 確認は施術記録の指示医のみ。
- BR-34-02: 確認 SLA は **施術後 72 時間以内**（[仮決定]）。超過時は施設・運営にエスカレーション。
- BR-34-03: 修正依頼は具体的なコメント必須。
- BR-34-04: 確認後の修正は「追記」のみ。元記録は改ざん不可。
- BR-34-05: 確認完了で決済確定（FR-38、Stripe Capture）が自動キック。
- BR-34-06: 異変・特記ありの記録は確認時に指示医の所見記入を促す。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 担当外の指示医 | 403 |
| revision コメント空 | 「修正依頼の理由を記入してください」 |

## 受入基準（AC）

### AC-34-01: 確認
```gherkin
Given submitted の施術記録 R-001
When U-03 が「確認」をクリック
Then treatment_records.status=confirmed
And confirmed_at, confirmed_by 記録
And 決済確定 (FR-38) ジョブが投入される
And 看護師に確認完了通知
```

### AC-34-02: 修正依頼
```gherkin
Given submitted の施術記録 R-001
When U-03 が「修正依頼」+ コメント「色素ロット番号の記入をお願いします」
Then status=revision_requested
And 看護師に通知メール
And 看護師が編集 → 再投入
```

### AC-34-03: SLA 超過
```gherkin
Given submitted の施術記録、施術後 73h 経過、確認なし
Then 施設管理者と運営にエスカレーション通知
```

### AC-34-04: 異変記録の所見記入促進
```gherkin
Given submitted の施術記録、異変記入あり
When U-03 が確認画面を開く
Then 「指示医の所見を記入してください」入力欄が必須
```

### AC-34-05: 確認後の追記
```gherkin
Given confirmed の施術記録
When 看護師が「追記」をクリック
Then 元記録は変更されず、新規 addendum レコードが追加される
```

## サブ機能
- FR-34-1: 確認・修正依頼
- FR-34-2: 追記管理
- FR-34-3: SLA 監視・エスカレーション

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
