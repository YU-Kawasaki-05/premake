---
id: FR-09
title: 医療機関開設届審査
priority: P0
status: designed
related_users: [U-02, U-04]
related_screens: [SCR-13-facility-license-upload, SCR-12-ops-review]
related_features: [FR-02, FR-13, FR-54, FR-78]
version: 1
---

# FR-09: 医療機関開設届審査

## 概要
施設管理者（U-02）が医療機関の開設届出書類等をアップロードし、運営が手動審査する。承認後、スペース登録（FR-14）と公開（FR-17）が解放される。

## アクター
- U-02 施設管理者（申請）
- U-04 運営（審査）

## 入力データ

### 施設側
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| 開設届出書類画像 / PDF | file | ○ | PDF/JPEG/PNG、20MB 以下 |
| 開設届番号 | string | ○ | 自治体発行番号 |
| 開設許可日 | date | ○ | 過去日付 |
| 管轄保健所名 | string | ○ | 1〜100 文字 |
| 法人格情報（法人名 / 法人番号） | string | × | 13 桁国税庁法人番号 |
| 担当者本人確認書類 | file | ○ | 運転免許証 / マイナンバーカード等、20MB 以下 |
| 自撮り写真（本人確認書類と同時） | file | ○ | 5MB 以下 |
| 法人配下登録の場合の法人 ID | uuid | × | U-06 法人管理者からの代理招待時のみ |

### 運営側
FR-08 と同じ（approved / rejected / info_required + 理由）

## 出力 / 結果
- 申請: `facility_license_applications` 作成、`facilities.status=pending_review`
- 承認: `facilities.status=approved`, スペース登録機能（FR-14）解放
- 却下: 理由付きメール、再申請可能

## ビジネスルール
- BR-09-01: facility 承認前は FR-14（スペース登録）不可。FR-13（プロフィール下書き）は可能。
- BR-09-02: 開設届画像は暗号化保存（FR-78）。
- BR-09-03: 法人配下の場合、法人 (FR-82) 自体も承認済みであること。
- BR-09-04: 開設届番号は重複検知（同一施設の二重登録防止）。
- BR-09-05: 審査 SLA は **5 営業日以内**（[仮決定]）。
- BR-09-06: 承認後の凍結はあり（不正検知時、運営判断で `status=suspended`）。

## エラーケース
FR-08 と同様（ファイルサイズ / 形式 / 必須欠落）

## 受入基準（AC）

### AC-09-01: 正常系
```gherkin
Given U-02 が招待経由でサインアップ完了（status=email_verified）
When 開設届書類等を必須項目を含めてアップロード
Then facility_license_applications レコード作成
And facilities.status=pending_review
And 運営に通知メール
```

### AC-09-02: 承認による機能解放
```gherkin
Given facility が pending_review
When U-04 が承認
Then facilities.status=approved に更新
And U-02 にメール通知
And FR-14 スペース登録ボタンが活性化
```

### AC-09-03: 却下
```gherkin
Given facility が pending_review
When U-04 が「却下」+ 理由を入力
Then facilities.status=rejected
And U-02 に却下理由メール
And 再申請ボタンが活性化
```

### AC-09-04: 法人配下の整合性
```gherkin
Given U-06 の法人 (org_id=O-001) が status=pending_review
And U-06 が代理で facility (org_id=O-001) を申請
Then facility の審査は org の審査完了を待つ（依存関係エラーは出さず、内部状態 blocked_by_org）
When org が approved になる
Then facility 審査が pending_review に進む
```

### AC-09-05: 開設届番号重複
```gherkin
Given 既に approved の facility と同じ開設届番号
When 別 U-02 が同番号で申請
Then 警告「同じ番号の医療機関が既に登録されています」
And 申請は受け付けるが U-04 が判断（不正登録の可能性）
```

## サブ機能
- FR-09-1: 開設届アップロード
- FR-09-2: 運営審査画面
- FR-09-3: 法人連動

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
