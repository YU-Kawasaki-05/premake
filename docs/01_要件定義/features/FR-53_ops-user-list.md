---
id: FR-53
title: 運営: ユーザー一覧・検索
priority: P0
status: defined
related_users: [U-04]
related_screens: [SCR-90-ops-user-list]
related_features: [FR-08, FR-11, FR-54, FR-78]
version: 1
---

# FR-53: 運営: ユーザー一覧・検索

## 概要
運営が全ユーザー（U-01〜U-03, U-05, U-06）を検索・一覧表示する。各ユーザーの状態・関連データへの導線を提供。

## アクター
- U-04 運営

## 入力データ
- フィルタ: role, status, license_status, created_at_range, keyword（メール / 氏名 / 医籍番号 等）
- sort: created_at / last_login / activity

## 出力 / 結果
- 一覧（ID 末尾 / メール / 氏名 / role / status / 登録日 / 最終ログイン）
- 詳細リンク

## ビジネスルール
- BR-53-01: 個人情報マスキング（FR-78）が適用、フル表示には閲覧理由必須。
- BR-53-02: 一覧アクセスは監査ログに記録。
- BR-53-03: 大量データ（10000+）に耐えるページング（cursor-based）。

## 受入基準（AC）

### AC-53-01: 一覧表示
```gherkin
Given ユーザー 500 件
When 運営が一覧画面を開く
Then ページング 50 件ずつ表示
And デフォルトソート: 最終ログイン降順
```

### AC-53-02: フィルタ
```gherkin
When 「role=nurse + license_status=pending_review」フィルタ
Then 該当ユーザーのみ表示
And 件数バッジ表示
```

### AC-53-03: マスキング
```gherkin
When 一覧表示
Then 氏名は「山田 H」などイニシャル
And メールは「ya****@example.com」マスキング
When 詳細を開く（理由入力）
Then フル表示
```

## サブ機能
- FR-53-1: フィルタ・検索
- FR-53-2: マスキング

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
