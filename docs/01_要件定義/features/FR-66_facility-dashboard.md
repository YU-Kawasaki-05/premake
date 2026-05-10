---
id: FR-66
title: 施設ダッシュボード
priority: P0
status: defined
related_users: [U-02]
related_screens: [SCR-111-facility-dashboard]
related_features: [FR-22, FR-26, FR-43, FR-44]
version: 1
---

# FR-66: 施設ダッシュボード

## 概要
施設管理者（U-02）のホーム画面。承認待ち予約 / 稼働率 / 収益 / 入金スケジュール / 担当指示医ステータスを表示。

## 構成要素
- 承認待ち予約（FR-22 への CTA）
- 直近予約一覧
- 稼働率グラフ（スペース別、月次）
- 収益サマリ（FR-43 連動）
- 入金スケジュール（FR-44 連動）
- 指示医ステータス（割当済 / 未割当 / 通知未読）
- 重要バナー（Stripe Connect 連携不完全 / 開設届審査中 等）

## ビジネスルール
- BR-66-01: 承認待ちは最優先表示。
- BR-66-02: 稼働率 = 予約済み時間 / 公開時間。低稼働スペースの可視化。
- BR-66-03: 必要に応じて施設管理者複数名の閲覧分離（後付け、Phase 2）。

## 受入基準（AC）

### AC-66-01: 承認待ち優先
```gherkin
Given 承認待ち 3 件
Then 最上部に集約カードで表示
And 各カードに「承認 / 拒否」ボタン
```

### AC-66-02: 稼働率
```gherkin
Given スペース 5 つ
Then スペース別の月次稼働率が棒グラフで表示
```

### AC-66-03: Stripe 連携警告
```gherkin
Given Stripe payouts_enabled=false
Then 上部に警告バナー
```

## サブ機能
- FR-66-1: 承認待ち集約
- FR-66-2: 稼働率分析
- FR-66-3: Stripe 連携監視

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
