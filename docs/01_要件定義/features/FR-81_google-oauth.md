---
id: FR-81
title: Google OAuth サインアップ・ログイン
priority: P0
status: designed
related_users: [U-01, U-02, U-03, U-04, U-06]
related_screens: [SCR-01-signup, SCR-05-login]
related_features: [FR-01, FR-02, FR-03, FR-04, FR-06, FR-07]
version: 1
---

# FR-81: Google OAuth サインアップ・ログイン

## 概要
全認証ユーザー（U-01, U-02, U-03, U-04, U-06）が Google アカウントでサインアップ・ログインできる。U-04 運営は自社ドメイン制限を推奨（DEC-17）。

## アクター
- 全認証ユーザー（Google アカウント保有）

## 入力データ
- Google OAuth 2.0 認可コード（リダイレクト経由）
- ユーザー情報（Google から）: email, email_verified, name, picture, sub（Google ユニーク ID）
- スコープ: `openid email profile`

## 出力 / 結果
### サインアップ時（looking 招待トークンと併用も可）
- 既存 Google sub が `users.google_sub` に存在 → ログイン処理
- 存在しない & email も未登録 → 新規 users レコード作成（`google_sub` 保存、`status=email_verified`）
- 存在しない & email は既存（パスワードユーザー） → アカウント連携確認画面（パスワード再入力で連携）

### ログイン時
- 既存 Google sub と紐付くユーザーがいればセッション発行（FR-04 と同じロール別リダイレクト）
- 未登録 Google アカウント → エラー「このアカウントは登録されていません」+ サインアップ導線

## ビジネスルール
- BR-81-01: Google 側で `email_verified=false` のアカウントは拒否。
- BR-81-02: 看護師（U-01）の Google サインアップは「メール確認のみスキップ」。免許審査（FR-08）は通常通り必要。
- BR-81-03: 施設管理者・指示医・法人管理者のサインアップは **招待トークン併用必須**（招待トークンに紐づく facility / org に Google アカウントを紐付ける）。
- BR-81-04: U-04 運営は **メールドメイン制限** をデフォルト ON。設定可能なドメインは環境変数で管理（[仮決定]: 自社ドメインのみ）。
- BR-81-05: 既存パスワードユーザーが Google でログインしようとした場合、**アカウント連携フロー** に誘導（パスワード再入力で同一ユーザーに紐付け）。
- BR-81-06: 1 ユーザーに紐づく Google sub は 1 つのみ。
- BR-81-07: Google OAuth 経由でも MFA 設定済みなら 2FA 要求（FR-07）。
- BR-81-08: Google でアカウント削除された場合、次回ログインで失敗 → 通常ログイン（パスワード）にフォールバック可能。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| Google 側のメール未確認 | エラー「Google 側でメール確認を完了してください」 |
| 招待トークン併用必須なのに無し（U-02 等） | サインアップ画面で招待コード入力を促す |
| 運営ドメイン制限違反 | 「このドメインのアカウントでは登録できません」 |
| 既存パスワードユーザーとの衝突 | 連携確認画面に遷移 |

## 受入基準（AC）

### AC-81-01: 看護師の Google サインアップ
```gherkin
Given email "nurse@gmail.com" は未登録
When Google OAuth でサインアップを試み、Google から email_verified=true で返る
Then users レコード（role=nurse, google_sub=xxx, status=email_verified）が作成される
And 看護師ダッシュボードに遷移
But 免許審査（FR-08）はまだ必要なバナー表示
```

### AC-81-02: 施設管理者の Google サインアップ（招待併用）
```gherkin
Given U-04 が招待リンクを発行（facility_id=F-001 紐付け）
When U-02 候補者が招待リンクから Google OAuth サインアップ
Then users レコード（role=facility_admin, facility_id=F-001, google_sub=xxx）が作成
```

### AC-81-03: Google ログイン
```gherkin
Given users.google_sub=xxx の U-01 が登録済み
When 同 Google アカウントでログイン
Then パスワード入力なしでセッション発行
And ロール別ダッシュボードへ
```

### AC-81-04: 既存パスワードユーザーとの連携
```gherkin
Given email "x@example.com" のユーザーがパスワード認証で登録済み
And users.google_sub=null
When 同じ email "x@example.com" の Google アカウントで OAuth ログイン
Then 連携確認画面が表示される
When ユーザーがパスワード再入力で確認
Then users.google_sub=xxx が紐付けされる
And 以降は両方の方法でログイン可能
```

### AC-81-05: 運営のドメイン制限
```gherkin
Given U-04 運営の Google OAuth 許可ドメインは "fouryou.co.jp" のみ
When email "user@gmail.com" でログインを試みる
Then エラー「このドメインのアカウントでは登録できません」
And セッションは発行されない

When email "user@fouryou.co.jp" でログイン
Then 通常通りログイン成功（MFA 要求あり）
```

### AC-81-06: Google sub の重複
```gherkin
Given users.google_sub=xxx で U-01 が登録済み
When 別 email で同じ Google sub でログインを試みる（理論上、同一 Google アカウントの email 変更）
Then 既存の U-01 として認識される（email も Google 側に同期）
```

### AC-81-07: 未登録 Google アカウント
```gherkin
Given 当該 Google sub は未登録
When ログイン画面から Google でログインを試みる
Then エラー「このアカウントは登録されていません」
And 「サインアップする」導線が表示される
```

## サブ機能
- FR-81-1: Google OAuth 認可コードフロー
- FR-81-2: 既存ユーザー連携
- FR-81-3: ドメイン制限（運営）

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
