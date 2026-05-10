---
id: FR-61
title: 利用規約ページ
priority: P0
status: designed
related_users: []
related_screens: [SCR-100-tos]
related_features: [FR-01, FR-60]
version: 1
---

# FR-61: 利用規約ページ

## 概要
利用規約の公開ページ。サインアップ時の同意必須（FR-01）、規約改定時の再同意フロー。

## アクター
- 全員（公開）

## 出力 / 結果
- 規約本文（バージョン管理）
- 改定履歴
- 看護師 / 施設 / 法人 / 利用客 ごとの個別条項

## ビジネスルール
- BR-61-01: 規約バージョンを `terms_versions` テーブルで管理。改定時は新バージョン発行。
- BR-61-02: 改定通知は 30 日告知（FR-60）+ 既存ユーザーに再同意促し。
- BR-61-03: 同意ログ（user_id / version / agreed_at / IP）を `user_term_consents` に保持。
- BR-61-04: 利用規約は **必須**: 法令準拠（特に医療機関スペース貸し関連）、Phase 2 で法務確認。

## 受入基準（AC）

### AC-61-01: 公開閲覧
```gherkin
When ゲストが /terms にアクセス
Then 最新版規約が表示される
And 改定履歴リンクあり
```

### AC-61-02: 改定再同意
```gherkin
Given 規約 v2 公開（30 日前告知済み）
When 既存ユーザーがログイン
Then 再同意ダイアログ表示
And 同意するまでコア機能制限
```

### AC-61-03: 同意ログ
```gherkin
When ユーザーが規約に同意
Then user_term_consents に INSERT（version, agreed_at, IP）
```

## サブ機能
- FR-61-1: 公開ページ
- FR-61-2: バージョン管理
- FR-61-3: 再同意フロー

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
