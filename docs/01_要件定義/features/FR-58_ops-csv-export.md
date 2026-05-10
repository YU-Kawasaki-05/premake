---
id: FR-58
title: 運営: CSV エクスポート
priority: P0
status: defined
related_users: [U-04]
related_screens: [SCR-95-ops-export]
related_features: [FR-43, FR-55, FR-76, FR-77]
version: 1
---

# FR-58: 運営: CSV エクスポート

## 概要
運営が会計連携・経営分析用の CSV をエクスポートする。データ量が大きい場合はバックグラウンドジョブで生成しメール添付 or ダウンロード URL を発行。

## アクター
- U-04 運営

## エクスポート対象（β段階）
- 取引一覧（payments + bookings）
- ユーザー一覧
- 施設一覧
- 法人一覧
- レビュー一覧
- 決済明細（手数料控除前後）
- 監査ログ（FR-76、運営アクションのみ）

## 入力データ
| target | enum | ○ | 上記 |
| date_range | date range | ○ | - |
| filter | object | × | - |
| format | enum | × | "csv" / "tsv" / "xlsx" |
| include_pii | boolean | × | デフォルト false |

## 出力 / 結果
- 直接ダウンロード（< 5MB）or バックグラウンド生成 + S3 署名付き URL（24h 有効）+ メール通知
- 監査ログに「エクスポート」記録

## ビジネスルール
- BR-58-01: PII 含む CSV は include_pii=true で別途承認制。出力ファイルにウォーターマーク（運営 ID）。
- BR-58-02: ダウンロード URL は 24 時間で失効、1 回限り使用（[仮決定]）。
- BR-58-03: 大量出力（10 万行以上）はバックグラウンド処理。
- BR-58-04: エクスポート履歴を `export_logs` テーブルに保持（監査）。

## 受入基準（AC）

### AC-58-01: 小規模エクスポート
```gherkin
Given 当月取引 500 件
When 運営が「CSV エクスポート」
Then 即時 ZIP ダウンロード
And 監査ログ記録
```

### AC-58-02: 大規模エクスポート
```gherkin
Given 当年取引 100,000 件
When 「CSV エクスポート」
Then バックグラウンドジョブで生成
And 完了時にメールで署名付き URL 通知
```

### AC-58-03: PII 含むエクスポート
```gherkin
When include_pii=true で実行
Then 確認ダイアログ「PII を含むファイルをダウンロードします」
And 別運営の承認が必要
When 承認後
Then ウォーターマーク付き CSV
```

### AC-58-04: URL 失効
```gherkin
Given ダウンロード URL 発行から 25 時間経過
When URL アクセス
Then 「URL 期限切れ」+ 再発行導線
```

## サブ機能
- FR-58-1: 即時 / バックグラウンド分岐
- FR-58-2: PII 承認制
- FR-58-3: 履歴管理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
