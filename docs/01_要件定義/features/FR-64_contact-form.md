---
id: FR-64
title: お問い合わせフォーム
priority: P0
status: defined
related_users: []
related_screens: [SCR-103-contact]
related_features: [FR-46, FR-77]
version: 1
---

# FR-64: お問い合わせフォーム

## 概要
ゲスト・登録ユーザー双方からの問い合わせを受け付ける公開フォーム。運営側の問合せ管理画面と連動。

## アクター
- 全ユーザー（ゲスト含む）

## 入力データ
| name | string | ○ | 1〜100 |
| email | string | ○ | RFC5322 |
| 種別 | enum | ○ | "サービス" / "決済" / "技術トラブル" / "申請" / "その他" |
| 件名 | string | ○ | 1〜200 |
| 本文 | string | ○ | 10〜5000 |
| reCAPTCHA | string | ○ | spam 対策 |

## 出力 / 結果
- `inquiries` レコード作成
- 運営に通知メール
- 自動返信（受付確認）メール

## ビジネスルール
- BR-64-01: reCAPTCHA v3 必須（spam 防止）。
- BR-64-02: 同 IP からの過剰な投稿はレート制限（1 時間 5 件）。
- BR-64-03: 種別ごとに運営担当者ルーティング（[仮決定]）。
- BR-64-04: SLA: 1 営業日以内 1 次回答（[仮決定]）。

## 受入基準（AC）

### AC-64-01: 投稿
```gherkin
When ゲストがフォームに入力 + reCAPTCHA OK + 送信
Then inquiries レコード作成
And 運営に通知 + 自動返信メール
```

### AC-64-02: spam 防御
```gherkin
Given reCAPTCHA score 低
Then 送信前に拒否
And 「もう一度お試しください」表示
```

## サブ機能
- FR-64-1: 公開フォーム
- FR-64-2: spam 対策
- FR-64-3: 自動返信

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
