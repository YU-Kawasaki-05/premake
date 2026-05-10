---
id: FR-82
title: 法人プロフィール登録・編集
priority: P0
status: defined
related_users: [U-06, U-04]
related_screens: [SCR-30-org-profile]
related_features: [FR-09, FR-83, FR-84, FR-85]
version: 1
---

# FR-82: 法人プロフィール登録・編集

## 概要
法人管理者（U-06）が医療法人の本部情報を登録・編集する。法人レベルの審査（運営による法人格確認）を通過した後、配下施設の追加（FR-83）が可能になる。

## アクター
- U-06 法人管理者
- U-04 運営（審査）

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| 法人名 | string | ○ | 1〜200 文字 |
| 法人格 | enum | ○ | "医療法人" / "社団医療法人" / "財団医療法人" / "個人事業" / "株式会社" / "その他" |
| 法人番号 | string | ○ | 13 桁国税庁法人番号 |
| 設立年月日 | date | ○ | 過去日付 |
| 代表者氏名 / 役職 | string | ○ | - |
| 本部住所 | string | ○ | 住所（自動補完） |
| 連絡先（電話・メール） | string | ○ | - |
| 公式サイト URL | string | × | https |
| 法人登記簿 / 認可書類 | file | ○ | PDF/JPEG、20MB 以下 |

## 出力 / 結果
- `organizations` テーブルに INSERT/UPDATE
- 初回 INSERT 時は `status=pending_review`
- 運営承認後 `status=approved`、配下施設追加可能

## ビジネスルール
- BR-82-01: 法人番号は重複不可（国税庁ベース）。
- BR-82-02: 承認前は配下施設追加不可（FR-83）。
- BR-82-03: 法人プロフィールの重要項目変更時は再審査（FR-09 と同様）。
- BR-82-04: 法人解散時は status=closed、配下施設は別法人移管 or 個別 facility に独立化（運営オペ）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 法人番号重複 | 「この法人番号は既に登録されています」 |
| 必須欠落 | フィールドエラー |

## 受入基準（AC）

### AC-82-01: 初回登録
```gherkin
Given U-06 がサインアップ完了
When 法人プロフィール必須項目を入力 + 法人登記簿アップロード
Then organizations レコードが status=pending_review で INSERT
And U-04 に通知メール
```

### AC-82-02: 承認による機能解放
```gherkin
Given organizations が pending_review
When U-04 が承認
Then status=approved に更新
And U-06 にメール通知
And FR-83 配下施設追加が活性化
```

### AC-82-03: 法人番号重複
```gherkin
Given 法人番号 "1234567890123" が approved 状態
When 別 U-06 が同じ法人番号で登録
Then エラー「この法人番号は既に登録されています」
```

## サブ機能
- FR-82-1: 法人プロフィール編集
- FR-82-2: 法人審査ワークフロー

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
