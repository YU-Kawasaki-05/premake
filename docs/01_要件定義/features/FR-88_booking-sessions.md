---
id: FR-88
title: 予約セッション管理（カウンセリング+施術）
priority: P0
status: defined
related_users: [U-01, U-02, U-03, U-05]
related_screens: [SCR-49-session-detail]
related_features: [FR-21, FR-23, FR-29, FR-33, FR-70]
version: 1
---

# FR-88: 予約セッション管理（カウンセリング+施術）

## 概要
1 予約に複数セッション（カウンセリング / 施術）を持たせるステップ列モデル（DEC-15）。同日完結・別日施術・カウンセリングのみ完結を統一データモデルで扱う。法令上、施術セッションには電子指示書（FR-29）が必須、カウンセリングには不要。

## アクター
- U-01 看護師（セッション管理）
- U-02 施設管理者（セッション承認）
- U-03 指示医（施術セッションへの指示書発行）
- U-05 利用客（セッションごとの予約確認）

## データモデル

### booking_sessions
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| id | uuid | ○ | - |
| booking_id | uuid | ○ | 親予約 |
| sequence_no | int | ○ | 1, 2, 3, ... |
| type | enum | ○ | "consultation" / "treatment" |
| start_at, end_at | datetime | ○ | - |
| status | enum | ○ | "scheduled" / "in_progress" / "completed" / "skipped" / "cancelled" |
| customer_id | uuid | × | K カテゴリで紐付け |
| 施術メニュー | enum[] | × (treatment 時必須) | - |
| 関連 prescription_id | uuid | × (treatment 時必須) | FR-29 |
| 関連 treatment_record_id | uuid | × (completed 後) | FR-33 |
| メモ | string | × | - |

## 入力 / 操作

### セッション追加
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| booking_id | uuid | ○ | - |
| type | enum | ○ | - |
| start_at, end_at | datetime | ○ | - |

### セッション完了
| session_id | uuid | ○ | - |
| 完了確定（看護師） | boolean | ○ | - |

## 出力 / 結果
- セッション一覧の更新
- 状態遷移により次セッションが活性化（例: カウンセリング完了で施術セッションが対応可に）

## ビジネスルール
- BR-88-01: 1 予約に最低 1 セッション必須（カウンセリングのみ or 施術のみ も可）。
- BR-88-02: 施術セッションは電子指示書（FR-29）発行済みでないと開始できない。
- BR-88-03: セッションの順序は sequence_no で管理。基本はカウンセリング → 施術の順だが、カウンセリングなしの施術もあり。
- BR-88-04: 1 セッションが「skipped」でも他セッションは独立に進行可能（カウンセリングのみ完結ケース）。
- BR-88-05: セッションごとに別日も可能（DEC-15）。各セッションの空き枠チェックは独立。
- BR-88-06: セッション間の最短間隔は **施術 → 施術** で 1 時間（[仮決定]、施術部位の腫れ等を考慮）。
- BR-88-07: セッション追加・削除は施設管理者承認制（FR-23 と同じ）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 指示書なしで施術セッション開始 | 「指示書発行が必要です」 |
| セッション間隔が短すぎる | 「セッション間は最低 1 時間空けてください」 |

## 受入基準（AC）

### AC-88-01: 同日カウンセリング+施術
```gherkin
Given 新規 booking
When 看護師が「カウンセリング 14:00-14:30 + 施術 14:30-16:00」で申込
Then booking_sessions に 2 件 INSERT (sequence_no=1, 2)
And type=consultation, type=treatment
```

### AC-88-02: 別日カウンセリング+施術
```gherkin
Given 新規 booking
When 看護師が「カウンセリング 6/15 + 施術 6/22」で申込
Then 各セッションが独立した日時で作成される
And 各セッションが個別にスペース空き枠と整合
```

### AC-88-03: カウンセリングのみで完結
```gherkin
Given booking に カウンセリング + 施術 の 2 セッション
When カウンセリング後、利用客が施術中止を選択
Then 看護師が施術セッションを「skipped (理由: 利用客辞退)」に更新
And 料金はカウンセリング分のみ（FR-15 のセッション別料金で算出）
And キャンセルポリシー（FR-41）は施術セッション部分にのみ適用
```

### AC-88-04: 指示書未発行で施術ブロック
```gherkin
Given 施術セッション S-2 が scheduled
And 関連 prescription_id=null
When 看護師が「施術開始」をクリック
Then エラー「指示書発行が必要です」
And セッションは scheduled のまま
```

### AC-88-05: セッション間隔チェック
```gherkin
Given booking に「施術 14:00-15:00 + 施術 15:30-16:00」を試みる
Then エラー「セッション間は最低 1 時間空けてください」
```

### AC-88-06: セッション完了 → 次セッション活性化
```gherkin
Given booking のカウンセリング 14:00-14:30 が in_progress
When 看護師が「カウンセリング完了」をマーク
Then status=completed に更新
And 次の施術セッションの「指示書発行依頼」と「施術開始」UI が活性化
```

### AC-88-07: 別日完結のセッション独立性
```gherkin
Given booking のカウンセリング(6/15) と 施術(6/22)
When カウンセリング(6/15) 当日にセッションだけ完了
Then 施術(6/22) は scheduled のまま、6/22 に独立して進行
```

## サブ機能
- FR-88-1: セッション CRUD
- FR-88-2: セッション完了マーキング
- FR-88-3: セッション間隔バリデーション
- FR-88-4: skipped による部分完結

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
