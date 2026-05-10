---
id: FR-13
title: 医療機関プロフィール登録・編集
priority: P0
status: defined
related_users: [U-02, U-06]
related_screens: [SCR-20-facility-profile]
related_features: [FR-09, FR-14, FR-83]
version: 1
---

# FR-13: 医療機関プロフィール登録・編集

## 概要
施設管理者（U-02）または法人管理者（U-06）が医療機関の基本情報を登録・編集する。プロフィールは看護師の検索結果（FR-19）と公開ページ（FR-20）に表示される。

## アクター
- U-02 施設管理者（自施設）
- U-06 法人管理者（配下施設）

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| 医療機関名 | string | ○ | 1〜200 文字 |
| 機関種別 | enum | ○ | "病院" / "診療所" / "クリニック" / "その他" |
| 郵便番号 | string | ○ | 7 桁数字 |
| 住所 | string | ○ | 1〜500 文字（自動補完あり） |
| 緯度経度 | float | △ | 住所から自動算出 |
| 代表電話 | string | ○ | 日本形式 |
| 代表メール | string | ○ | RFC5322 |
| 公式サイト URL | string | × | https のみ |
| 開設者氏名 | string | ○ | 1〜100 文字 |
| 院長氏名 | string | ○ | 1〜100 文字 |
| 標榜診療科 | enum[] | ○ | 複数選択 |
| 機関ロゴ画像 | file | × | PNG/JPEG、5MB 以下 |
| 外観写真 | file[] | × | 最大 10 枚、各 10MB 以下 |
| アクセス情報 | string | × | 1〜2000 文字 |
| 駐車場有無 | boolean | × | - |
| 法人 ID | uuid | × | 法人配下の場合 |

## 出力 / 結果
- `facilities` テーブルに INSERT または UPDATE
- 写真は別 bucket に保存、`facility_images` テーブルで関連管理
- 公開状態は別途 FR-17 で制御

## ビジネスルール
- BR-13-01: プロフィール編集は `facilities.status=approved` 後も可能。重要項目（医療機関名・住所・開設者）の変更は U-04 への通知 + 再審査要否判定（[仮決定]）。
- BR-13-02: 住所から緯度経度を自動算出（外部 Geocoding API、Phase 3 で確定）。
- BR-13-03: 機関名は重複禁止（同一住所で同名は不可）。
- BR-13-04: 写真は WebP 自動変換 + 複数解像度生成（看護師検索結果のサムネイル用）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 必須欠落 | フィールドエラー |
| 住所形式エラー / Geocoding 失敗 | 警告表示、緯度経度を null で保存（後で修正可） |
| 重複機関名 | 警告 + 確認ダイアログ |

## 受入基準（AC）

### AC-13-01: 初回登録
```gherkin
Given U-02 が招待でサインアップ完了、facility はまだ未編集
When 必須項目を入力して「保存」
Then facilities レコードが INSERT される
And status は pending_review のまま（FR-09 の審査が必要）
```

### AC-13-02: 編集
```gherkin
Given facility が approved
When U-02 が説明文・写真を編集
Then UPDATE される
And 検索（FR-19）の表示が次回 reindex で反映される
```

### AC-13-03: 重要項目変更時の再審査
```gherkin
Given facility が approved
When 医療機関名を変更
Then 確認ダイアログ「医療機関名の変更は再審査の対象です」が表示される
When 確定
Then facilities.status=pending_re_review に更新
And 公開状態は自動的に「非公開」に戻る
And U-04 に通知メール
```

### AC-13-04: 法人配下の編集権限
```gherkin
Given facility (org_id=O-001)
And U-06 が org_id=O-001 の管理者
When U-06 が当該 facility のプロフィール編集を試みる
Then 編集可能
But 別法人 (org_id=O-002) の facility は編集不可（403）
```

## サブ機能
- FR-13-1: プロフィール編集
- FR-13-2: 写真アップロード・管理
- FR-13-3: Geocoding 自動補完

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
