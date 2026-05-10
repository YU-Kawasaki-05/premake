---
id: FR-79
title: フィーチャーフラグ
priority: P1
status: designed
related_users: [U-04]
related_screens: [SCR-130-feature-flags]
related_features: []
version: 1
---

# FR-79: フィーチャーフラグ（P1）

## 概要
β機能の段階公開・A/B テスト・緊急 kill switch のためのフィーチャーフラグ基盤。

## アクター
- U-04 運営（フラグ管理）
- システム（実行時にフラグ評価）

## 機能
- フラグ定義（key / 説明 / 種別）
- ロールアウト戦略（all_users / specific_users / percentage / segment）
- 即時切替
- 履歴管理

## 種別
- リリースフラグ（β機能公開）
- 実験フラグ（A/B テスト）
- 運用フラグ（kill switch、緊急停止）
- 設定フラグ（プラットフォーム手数料率等の動的変更）

## ビジネスルール
- BR-79-01: フラグ評価は < 10ms（NFR-PERF）。Redis キャッシュ。
- BR-79-02: フラグ変更は即時反映 + 監査ログ。
- BR-79-03: kill switch は最高優先度、複数承認なしで即時実行可。
- BR-79-04: 廃止フラグは一定期間残し、コードからも除去（drift 防止）。

## 受入基準（AC）

### AC-79-01: フラグ ON/OFF
```gherkin
Given フラグ "show_review_beta" = false
When 運営が ON
Then 即時反映 (キャッシュ無効化)
And ユーザーに新機能表示
```

### AC-79-02: パーセンテージロールアウト
```gherkin
Given "new_search_ui" = 10% rollout
Then 一貫した hash 分割で 10% のユーザーに表示
```

### AC-79-03: kill switch
```gherkin
Given 障害発生
When 運営が "stripe_capture_enabled" = false
Then 即時 Capture ジョブ停止
```

## サブ機能
- FR-79-1: フラグ管理 UI
- FR-79-2: 評価ライブラリ
- FR-79-3: 監査ログ

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
