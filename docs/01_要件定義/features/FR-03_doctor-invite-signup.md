---
id: FR-03
title: 指示医招待型サインアップ（4経路）
priority: P0
status: defined
related_users: [U-03]
related_screens: [SCR-03-invite-accept]
related_features: [FR-02, FR-04, FR-10, FR-29, FR-81, FR-87]
version: 1
---

# FR-03: 指示医招待型サインアップ（4経路）

## 概要
指示医（U-03）は施設管理者（U-02）または法人管理者（U-06）の招待でアカウントを作成する（DEC-18）。FR-02 と同一の 4 経路（招待リンク / 招待コード / 申請型 / 運営代理）を提供。指示医は施術ごとに電子指示書を発行する責任者となるため、医師免許審査（FR-10）が完了するまで電子署名機能（FR-29）は解放されない。

## アクター
- U-03 指示医（未登録）
- 招待発行側: U-02 施設管理者 / U-06 法人管理者 / U-04 運営

## 入力データ
FR-02 と同一構造。追加で:
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| 医籍登録番号 | string | ○ | 6〜10 桁数字。重複不可 |
| 診療科 | string[] | ○ | プルダウン複数選択。アートメイク監督に関連する科を含むことが望ましい |
| 主たる勤務先施設 | facility_id | ○ | 招待元の施設 / 法人配下の施設から選択 |

## 出力 / 結果
- `users` テーブルに `role=doctor, status=email_verified, license_status=pending_review` で作成
- `doctor_profiles` テーブルに医籍登録番号・診療科を保存
- `users.facility_id` を招待元施設に紐付け（複数施設兼任の場合は `doctor_facility_assignments` テーブルで M:N 管理）

## ビジネスルール
- BR-03-01: FR-02 の BR と同じ（招待トークン 72 時間 / 1 回限り / メール一致 等）。
- BR-03-02: 医籍登録番号は重複不可。重複時は登録不可（既存ユーザーに連絡を促すメッセージ）。
- BR-03-03: 医師免許審査（FR-10）完了前は `prescription_issue_enabled=false`。電子指示書発行 API はガード。
- BR-03-04: 1 医師は複数施設を兼任可能（`doctor_facility_assignments` で M:N 管理）。
- BR-03-05: 指示医は同一法人内のみ兼任可能（[仮決定]、Phase 2 で再検討）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 医籍登録番号重複 | 「この医籍登録番号は既に登録されています。お心当たりがある場合は運営にご連絡ください」 |
| 招待時メール不一致 | FR-02 と同じ |
| 招待トークン失効 / 使用済み | FR-02 と同じ |

## 受入基準（AC）

### AC-03-01: 正常系 — 招待リンク経由
```gherkin
Given U-02 施設管理者が email "doctor@hospital.jp" 宛に招待リンクを発行（facility_id=F-001 紐付け）
When doctor@hospital.jp の所有者が招待リンクを開く
And 必須項目（パスワード / 氏名 / 医籍登録番号 / 診療科 / 主たる勤務先）を入力
And 「登録」をクリック
Then users レコード（role=doctor, license_status=pending_review）が作成される
And doctor_facility_assignments に F-001 が登録される
And ダッシュボードに遷移するが「医師免許の審査中」バナーが表示される
And 電子指示書発行ボタンは disabled
```

### AC-03-02: 医師免許審査完了後の機能解放
```gherkin
Given U-03 がサインアップ済み（license_status=pending_review）
When U-04 が医師免許を承認（license_status=approved に更新）
Then 当該ユーザーに通知メールが届く
And 次回ログイン時に「電子指示書発行が利用可能です」バナーが表示される
And prescription_issue_enabled=true となり、FR-29 の電子署名機能が解放される
```

### AC-03-03: 医籍登録番号の重複チェック
```gherkin
Given 医籍登録番号 "1234567" は既に別の U-03 ユーザーに登録済み
When 別人が同じ医籍登録番号でサインアップを試みる
Then エラー「この医籍登録番号は既に登録されています」が表示される
And users / doctor_profiles レコードは作成されない
```

### AC-03-04: 複数施設兼任
```gherkin
Given U-03 ユーザーが既に F-001 に紐付け済み
When U-06 法人管理者が同じ U-03 を F-002 にも招待
And U-03 が招待を受諾
Then doctor_facility_assignments に F-002 が追加される
And users.facility_id は変更されない（主たる勤務先のまま）
And U-03 ダッシュボードで施設切替が可能になる
```

## サブ機能
- FR-03-1: 招待発行（U-02 / U-04 / U-06 から）
- FR-03-2: 複数施設兼任管理
- FR-03-3: 医師免許審査完了による機能解放

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
