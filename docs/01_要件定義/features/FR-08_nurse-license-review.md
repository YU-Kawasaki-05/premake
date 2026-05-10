---
id: FR-08
title: 看護師免許アップロード・審査
priority: P0
status: defined
related_users: [U-01, U-04]
related_screens: [SCR-11-license-upload, SCR-12-ops-review]
related_features: [FR-01, FR-21, FR-54, FR-78]
version: 1
---

# FR-08: 看護師免許アップロード・審査

## 概要
U-01 看護師がメール確認後（FR-06）、看護師免許証の画像をアップロードし、運営が手動審査する。承認されるまで予約申込（FR-21）は不可。

## アクター
- U-01 看護師（申請）
- U-04 運営（審査）

## 入力データ

### 看護師側
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| 看護師免許証画像（表面） | file | ○ | JPEG/PNG/PDF、10MB 以下、画像の場合は最低 1500x1000 px 推奨 |
| 看護師免許証画像（裏面） | file | × | 同上 |
| 籍登録番号 | string | ○ | 数字、5〜10 桁 |
| 籍登録年月日 | date | ○ | 過去日付 |
| 本籍都道府県 | enum | ○ | 都道府県選択 |
| 自撮り写真（免許と同時に写る） | file | ○ | JPEG/PNG、5MB 以下、本人と免許が同時に写るセルフィー |

### 運営側
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| 審査結果 | enum | ○ | "approved" / "rejected" / "info_required" |
| 却下理由 / 追加情報依頼内容 | string | ×（rejected/info_required 時必須） | 50〜1000 文字 |

## 出力 / 結果
- 申請: `nurse_license_applications` レコード作成、`users.license_status=pending_review` に更新
- 承認: `users.license_status=approved`, `users.can_book=true` に更新、看護師に通知メール
- 却下: `users.license_status=rejected`, 却下理由メール送信、再申請可能
- 追加情報依頼: `users.license_status=info_required`, 詳細を伝える

## ビジネスルール
- BR-08-01: 看護師は免許承認まで予約申込（FR-21）不可。FR-04 でログインは可能だが、ダッシュボードに「免許審査中」バナー。
- BR-08-02: 免許画像は **暗号化** して保存（at-rest 暗号化、別 bucket / KMS）。
- BR-08-03: 個人情報マスキング（FR-78）の対象。運営の閲覧は監査ログ（FR-76）に記録。
- BR-08-04: 自撮り写真と免許の比較は人間が目視確認（β段階。AI 顔照合は P2）。
- BR-08-05: 籍登録番号は他の U-01 と重複不可。重複時は警告表示し、運営判断で対応。
- BR-08-06: 審査の SLA は **3 営業日以内**（[仮決定]）。超過時は運営にアラート。
- BR-08-07: 承認後でも「凍結（FR-11）」「免許失効報告」で license_status を rejected に戻せる。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 画像サイズ超過 | 「ファイルサイズが大きすぎます（10MB 以下）」 |
| 不正ファイル形式 | 「対応していないファイル形式です」 |
| 必須項目欠落 | フィールドエラー表示 |
| 籍登録番号重複 | 警告表示、申請は受け付け（運営判断） |

## 受入基準（AC）

### AC-08-01: 看護師による申請
```gherkin
Given U-01 が email_verified 状態
When 必須項目（免許表面画像 / 籍番号 / 籍登録年月日 / 本籍 / 自撮り写真）を入力
And 「申請」をクリック
Then nurse_license_applications レコードが作成される
And users.license_status が pending_review に更新される
And U-04 運営に新規申請通知メールが届く
And ダッシュボードに「審査中」バナーが表示される
```

### AC-08-02: 運営による承認
```gherkin
Given pending_review の申請が存在
When U-04 運営が審査画面で「承認」を選択
Then users.license_status=approved, can_book=true に更新される
And 当該看護師に「承認されました」通知メールが送信される
And ダッシュボードのバナーが消え、予約機能（FR-21）が解放される
And 監査ログに review_approved が記録される
```

### AC-08-03: 運営による却下
```gherkin
Given pending_review の申請
When U-04 運営が「却下」を選択し、理由「免許画像が不鮮明です」を入力
Then users.license_status=rejected に更新される
And 看護師に却下理由付きメールが送信される
And 看護師ダッシュボードで「再申請」ボタンが表示される
```

### AC-08-04: 追加情報依頼
```gherkin
Given pending_review の申請
When U-04 が「情報追加依頼」を選択し、依頼内容を入力
Then users.license_status=info_required に更新される
And 看護師にメールが届き、追加情報フォームへ誘導
When 看護師が追加情報を提出
Then 申請が pending_review に戻る
```

### AC-08-05: 免許承認前の予約申込ブロック
```gherkin
Given U-01 が license_status=pending_review
When 予約申込（FR-21）API を呼ぶ
Then HTTP 403 が返る
And UI 上は予約ボタンが disabled
```

### AC-08-06: 免許画像の暗号化保存
```gherkin
Given 免許画像がアップロードされた
When ストレージを直接確認
Then ファイルは暗号化されており、平文では読めない
And 一時 URL（署名付き、5 分有効）経由でのみ運営審査画面に表示される
```

### AC-08-07: 運営閲覧の監査ログ
```gherkin
Given U-04 が審査画面で看護師免許画像を表示
Then 監査ログに「U-04 (id) が U-01 (id) の license image を閲覧」が記録される
```

## サブ機能
- FR-08-1: 申請フォーム
- FR-08-2: 運営審査画面
- FR-08-3: 承認・却下・追加情報依頼の通知メール
- FR-08-4: 暗号化保存と署名付き URL 配信

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
