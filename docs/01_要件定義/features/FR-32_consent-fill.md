---
id: FR-32
title: 利用客の同意書記入
priority: P0
status: defined
related_users: [U-05]
related_screens: [SCR-54-consent-fill]
related_features: [FR-29, FR-31, FR-70, FR-72]
version: 1
---

# FR-32: 利用客の同意書記入

## 概要
利用客（U-05）が予約時または施術前に同意書に署名する。FR-31 のテンプレートに対し、各項目への確認チェックと自署サインを記録。

## アクター
- U-05 利用客

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| booking_session_id | uuid | ○ | 施術セッション |
| consent_template_version | int | ○ | 記入時のバージョン |
| 各セクションへの確認 | array | ○ | required_acknowledgement のセクションは全て true |
| 自署サイン画像 | file | ○ | Canvas 描画 → PNG、500KB 以下 |
| 記入時 IP | string | ○ | サーバー側で記録 |
| 同意日時 | datetime | ○ | サーバー側で記録 |

## 出力 / 結果
- `customer_consents` レコード作成
- サイン画像は別 bucket（暗号化）保存
- 記入完了で予約の `consent_status=signed` に更新

## ビジネスルール
- BR-32-01: 記入は予約紐付けの利用客（FR-70）のみ可能。メール+予約番号で本人確認。
- BR-32-02: 必須セクションへの確認なしには送信不可。
- BR-32-03: 自署サインは Canvas 描画形式 + IP/UA/タイムスタンプを meta として保持。
- BR-32-04: 記入後の改ざん不可。修正は再記入扱い（古いバージョンは保持）。
- BR-32-05: 18 歳未満の場合は **保護者同意** が必要（保護者氏名・続柄入力 + 別サイン）。
- BR-32-06: 同意書記入完了が指示書発行（FR-29）の前提条件。
- BR-32-07: PDF 化して保管（指示書 PDF と同様、FR-30 と同インフラ）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 必須セクション未確認 | 「すべての必須項目に同意が必要です」 |
| 自署画像サイズ超過 | 「サイン画像が大きすぎます」 |
| 18 歳未満で保護者情報なし | 「保護者の情報入力が必要です」 |

## 受入基準（AC）

### AC-32-01: 正常系
```gherkin
Given 利用客がメール+予約番号で同意書ページにアクセス
When 全必須セクションを確認
And Canvas で自署
And 「同意して送信」をクリック
Then customer_consents レコード作成
And サイン画像が暗号化保存
And 予約の consent_status=signed に更新
And 看護師にメール通知
```

### AC-32-02: 必須未確認のブロック
```gherkin
Given 必須セクション 5 つのうち 1 つ未確認
When 送信ボタンクリック
Then エラー「すべての必須項目に同意が必要です」
And 未確認セクションがハイライト
```

### AC-32-03: 18 歳未満の保護者同意
```gherkin
Given 利用客の生年月日から年齢が 17 歳
When 同意書ページを開く
Then 保護者氏名 / 続柄 / 別サインフォームが追加表示
When 全項目入力完了
Then customer_consents (guardian_required=true) で保存
```

### AC-32-04: 改ざん検出
```gherkin
Given 記入済み consent_id=C-001
When DB を直接 UPDATE
Then 監査ログ + ハッシュチェックで検出
And 運営アラート
```

### AC-32-05: PDF 化
```gherkin
Given 同意書記入完了
When バックグラウンドジョブ
Then 同意書 PDF が生成され、勝手の改ざん不可で保管
And 記入完了から閲覧可能
```

## サブ機能
- FR-32-1: 同意書記入フォーム
- FR-32-2: Canvas 自署
- FR-32-3: 保護者同意フロー
- FR-32-4: PDF 化

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
