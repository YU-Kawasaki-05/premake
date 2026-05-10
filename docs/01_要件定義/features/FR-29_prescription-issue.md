---
id: FR-29
title: 電子指示書発行・電子署名
priority: P0
status: designed
related_users: [U-03]
related_screens: [SCR-51-prescription-issue]
related_features: [FR-10, FR-28, FR-30, FR-33, FR-67, FR-88]
version: 1
---

# FR-29: 電子指示書発行・電子署名

## 概要
指示医（U-03）が、自施設の予約に対して施術看護師宛ての電子指示書を発行し、電子署名する。本機能は法令対応 (DEC-08, A 案) の中核成果物。

## アクター
- U-03 指示医（自施設の予約に対して）

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| booking_id | uuid | ○ | 自施設の予約 |
| session_id | uuid | ○ | 施術セッション（FR-88） |
| 指示内容 | object | ○ | 施術部位 / 使用色素 / 麻酔の使用可否 / 注意事項 |
| 利用客名（既知の場合） | string | × | K カテゴリで登録済みなら自動補完 |
| 同意書確認済 | boolean | ○ | true 必須（FR-32 の同意書を確認） |
| 過去アレルギー / 既往歴の確認 | boolean | ○ | 問診票（FR-72）を踏まえた確認 |
| 電子署名 | object | ○ | TOTP 再認証 + サーバー側で X.509 タイムスタンプ署名 |

## 出力 / 結果
- `prescriptions` レコード作成（status=issued）
- `prescription_pdfs` に PDF 生成指示（FR-30）
- 関連 `booking_sessions.prescription_id` を更新
- 看護師（U-01）に通知（FR-46）
- 監査ログに `prescription_issued` 記録

## ビジネスルール
- BR-29-01: license_status=approved の指示医のみ発行可。
- BR-29-02: 自施設の予約のみ発行可（doctor_facility_assignments で照合）。
- BR-29-03: 電子署名は **TOTP 再認証 + サーバー側 X.509 署名** + RFC 3161 タイムスタンプ。
- BR-29-04: 一度発行した指示書は **改ざん不可**。修正は「失効 + 新規発行」フロー。
- BR-29-05: 失効は同担当指示医のみ可能。失効事由を記録。
- BR-29-06: 施術完了後の指示書発行は不可（必ず施術前）。
- BR-29-07: 同意書（FR-32）と問診票（FR-72）が確認済みでないと発行不可。
- BR-29-08: 発行から 7 年間保管（医療記録保存義務、Phase 2 で確定）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 他施設の予約 | 403 |
| 同意書未確認 | 「同意書を確認してください」 |
| 既に発行済み | 「指示書は発行済みです（失効してから再発行）」 |

## 受入基準（AC）

### AC-29-01: 正常系
```gherkin
Given U-03 (license_status=approved, prescription_issue_enabled=true)
And 自施設の予約 B-001 の施術セッション S-2
And 同意書（FR-32）と問診票（FR-72）が確認済み
When U-03 が指示内容を入力 + TOTP 再認証 + 「発行」をクリック
Then prescriptions レコード作成（status=issued, signed_at, signature_x509）
And RFC 3161 タイムスタンプ取得
And PDF 生成キュー投入（FR-30）
And U-01 に通知メール
And 監査ログに prescription_issued 記録
```

### AC-29-02: 改ざん防止
```gherkin
Given prescriptions が issued 状態
When DB を直接 UPDATE で内容変更を試みる
Then 署名検証で改ざん検出
And FR-29 経由でない更新はトリガーで拒否
```

### AC-29-03: 失効 + 再発行
```gherkin
Given prescriptions B-001-S2 が issued
When 同担当 U-03 が「失効」+ 理由「指示内容修正のため」
Then status=revoked, revoked_at, revoke_reason 記録
And 当該 PDF は閲覧可能だが「失効済」スタンプ付き
When U-03 が新規発行
Then 新 prescriptions レコード作成（status=issued）
And 旧 PDF と新 PDF の関連性を保持（チェーン）
```

### AC-29-04: 同意書未確認時のブロック
```gherkin
Given 予約 B-001 の同意書未記入
When U-03 が指示書発行を試みる
Then エラー「同意書（FR-32）を確認してください」
And prescriptions レコードは作成されない
```

### AC-29-05: 他施設の予約への発行不可
```gherkin
Given U-03 は F-001 のみ所属
And 予約 B-002 は F-002 の予約
When U-03 が B-002 の指示書発行を試みる
Then 403
```

### AC-29-06: 施術後の発行不可
```gherkin
Given 施術セッション S-2 が completed
When U-03 が S-2 の指示書発行を試みる
Then エラー「施術完了後の発行はできません」
```

## サブ機能
- FR-29-1: 指示書入力フォーム
- FR-29-2: 電子署名（TOTP 再認証 + X.509 + RFC 3161）
- FR-29-3: 失効・再発行
- FR-29-4: 同意書 / 問診票確認連動

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
