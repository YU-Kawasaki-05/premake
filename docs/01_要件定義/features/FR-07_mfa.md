---
id: FR-07
title: MFA（TOTP / SMS）
priority: P0
status: designed
related_users: [U-01, U-02, U-03, U-04, U-06]
related_screens: [SCR-09-mfa-setup, SCR-10-mfa-verify]
related_features: [FR-04, FR-12, FR-76]
version: 1
---

# FR-07: MFA（TOTP / SMS）

## 概要
2 要素認証。TOTP（Google Authenticator 等）または SMS による 6 桁コード認証を提供。U-04 運営は **必須**、それ以外のユーザー (U-01, U-02, U-03, U-06) は推奨（任意）。

## アクター
- 全認証ユーザー

## 入力データ

### MFA セットアップ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| method | enum | ○ | "totp" / "sms" |
| phone_number (sms 時) | string | ○ | E.164 |
| verification_code | string | ○ | 6 桁数字 |

### MFA 検証（ログイン時）
| code | string | ○ | 6 桁数字。TOTP は 30 秒ウィンドウ、SMS は 5 分有効 |

## 出力 / 結果
- セットアップ完了: `users.mfa_enabled=true`, `mfa_method`, `totp_secret` (TOTP の場合) を保存
- バックアップコード 10 個を発行（一度だけ表示）
- ログイン時検証成功: 通常セッション発行

## ビジネスルール
- BR-07-01: U-04 運営は MFA 必須。サインアップ後の初回ログインで MFA セットアップ強制。
- BR-07-02: TOTP secret は暗号化して保存（KMS 推奨）。
- BR-07-03: SMS は通信遅延を考慮して 5 分有効。同じコードは 1 回限り。
- BR-07-04: バックアップコード 10 個を発行、各 1 回限り使用、紛失時の代替手段。
- BR-07-05: MFA 検証失敗 5 回連続で当該セッションを破棄、最初からログインやり直し。
- BR-07-06: MFA 無効化はパスワード再入力 + 確認メール経由でのみ可能。
- BR-07-07: MFA 設定変更（追加・削除）は監査ログ（FR-76）に記録。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| コード誤り | 「コードが正しくありません」（残り試行回数表示） |
| 5 回失敗 | 一時セッション破棄、ログインやり直し |
| TOTP コード時間切れ | 「新しいコードで再試行してください」 |
| SMS 送信失敗 | 別メソッドへの切替案内、サポート導線 |
| バックアップコード使用済み | 「このコードは既に使用済みです」 |

## 受入基準（AC）

### AC-07-01: TOTP セットアップ
```gherkin
Given U-01 がログイン済み（mfa_enabled=false）
When MFA 設定画面で "TOTP" を選択
Then QR コードと secret が表示される
When ユーザーが Authenticator アプリで読み込み、6 桁コードを入力
Then mfa_enabled=true, mfa_method=totp に更新される
And 10 個のバックアップコードが 1 度だけ表示される
And 監査ログに mfa_enabled が記録される
```

### AC-07-02: SMS セットアップ
```gherkin
Given U-02 がログイン済み
When MFA 設定で "SMS" を選択し、電話番号 +81-90-1234-5678 を入力
Then SMS で 6 桁コードが届く
When 5 分以内に正しいコードを入力
Then mfa_enabled=true, mfa_method=sms に更新される
```

### AC-07-03: ログイン時検証
```gherkin
Given U-01 が mfa_enabled=true（TOTP）
When 正しいパスワードでログイン
Then 2FA 入力画面に遷移する
When 正しい TOTP コードを入力
Then 通常セッションが発行され、ダッシュボードに遷移
```

### AC-07-04: U-04 運営の MFA 必須
```gherkin
Given U-04 運営ユーザーが新規作成され、初回ログイン
Then MFA セットアップを強制する画面が表示される
And MFA 完了までダッシュボードに到達できない
```

### AC-07-05: バックアップコード使用
```gherkin
Given U-01 が TOTP 端末を紛失
When ログイン時に「バックアップコードを使用」を選択
And 10 個のうち 1 個を入力
Then 検証成功、ダッシュボードに遷移
And 当該バックアップコードは消費済みとマークされる
And 残り 9 個になったことが通知される
```

### AC-07-06: 5 回連続失敗
```gherkin
Given MFA 入力画面
When 誤った 6 桁コードを 5 回連続入力
Then 一時セッションが破棄される
And ログイン画面にリダイレクトされる
And 「ログインからやり直してください」が表示される
```

### AC-07-07: MFA 無効化
```gherkin
Given U-01 が mfa_enabled=true
When MFA 無効化を試みる
Then パスワード再入力ダイアログが表示される
When 正しいパスワードを入力
Then 確認メールが送信され、メール内リンクをクリックで無効化
And 監査ログに mfa_disabled が記録される
```

## サブ機能
- FR-07-1: TOTP 設定・検証
- FR-07-2: SMS 設定・検証
- FR-07-3: バックアップコード生成・使用
- FR-07-4: MFA 無効化（二段階確認）

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
