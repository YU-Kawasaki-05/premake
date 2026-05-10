---
id: FR-10
title: 医師免許審査
priority: P0
status: defined
related_users: [U-03, U-04]
related_screens: [SCR-14-doctor-license-upload, SCR-12-ops-review]
related_features: [FR-03, FR-29, FR-54, FR-78]
version: 1
---

# FR-10: 医師免許審査

## 概要
指示医（U-03）が医師免許証をアップロードし、運営が審査する。承認まで電子指示書発行（FR-29）は不可。

## アクター
- U-03 指示医（申請）
- U-04 運営（審査）

## 入力データ
FR-08 と同様の構造に加え:
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| 医師免許証画像 | file | ○ | PDF/JPEG/PNG、10MB 以下 |
| 医籍登録番号 | string | ○ | サインアップ時に登録済みのものと整合 |
| 医籍登録年月日 | date | ○ | 過去日付 |
| 専門医資格証明（任意） | file | × | 関連診療科の専門医資格があれば |
| 自撮り写真（医師免許と同時） | file | ○ | 5MB 以下 |

## 出力 / 結果
- 申請: `doctor_license_applications` 作成、`users.license_status=pending_review`
- 承認: `users.license_status=approved`, `prescription_issue_enabled=true` で FR-29 解放
- 却下: 理由付きメール、再申請可能

## ビジネスルール
- BR-10-01: 医師免許承認前は FR-29（電子指示書発行）の API・UI ともに無効。
- BR-10-02: 医籍登録番号と公的データベースの突合は **β段階では人力**（厚労省データベース照合は P2）。
- BR-10-03: その他は FR-08 / FR-09 と同じ（暗号化、監査ログ、SLA 等）。
- BR-10-04: 承認後の医師免許失効報告（業務停止命令等）に対応する取り消しオペレーションを運営に提供。
- BR-10-05: 審査 SLA は **3 営業日以内**（[仮決定]）。

## エラーケース
FR-08 と同様

## 受入基準（AC）

### AC-10-01: 正常系
```gherkin
Given U-03 が招待経由でサインアップ完了
When 医師免許証画像 / 医籍番号 / 自撮り写真等を提出
Then doctor_license_applications 作成、license_status=pending_review
```

### AC-10-02: 承認後の電子指示書解放
```gherkin
Given pending_review 状態
When U-04 が承認
Then users.license_status=approved, prescription_issue_enabled=true
And 当該 U-03 にメール通知
And FR-29 の電子署名 UI が活性化
```

### AC-10-03: 医師免許承認前の電子指示書ブロック
```gherkin
Given U-03 が pending_review
When 電子指示書発行 API（FR-29）を呼ぶ
Then HTTP 403 が返る
And UI 上で発行ボタンが disabled
```

### AC-10-04: 失効処理
```gherkin
Given U-03 が approved 状態
When U-04 が「免許失効」操作（理由入力）
Then license_status=rejected, prescription_issue_enabled=false
And 当該 U-03 と関係施設の U-02 / U-06 に通知メール
And 進行中の発行済み指示書はそのまま有効、新規発行のみブロック
```

## サブ機能
- FR-10-1: 医師免許アップロード
- FR-10-2: 運営審査
- FR-10-3: 失効処理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
