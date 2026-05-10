---
id: FR-60
title: 運営: お知らせ配信
priority: P1
status: designed
related_users: [U-04]
related_screens: [SCR-98-ops-announcement]
related_features: [FR-46]
version: 1
---

# FR-60: 運営: お知らせ配信（P1）

## 概要
運営が全ユーザー or セグメント別にお知らせを配信。利用規約改定 / メンテナンス予告 / 新機能告知などに使用。

## アクター
- U-04 運営

## 入力データ
| target_segment | enum | ○ | "all" / "nurses" / "facilities" / "orgs" / "specific_users" |
| 配信チャネル | enum[] | ○ | "in_app" / "email" |
| タイトル / 本文 | string | ○ | - |
| 公開期間 | datetime range | × | - |
| 配信タイミング | datetime | × | デフォルト即時 |

## 出力 / 結果
- アプリ内バナー / 通知センター表示
- 該当ユーザーに一斉メール

## ビジネスルール
- BR-60-01: 規約改定は配信タイミング = 30 日後で固定（DEC: 法務確認、Phase 2）。
- BR-60-02: メンテナンス予告は 24h 前以上推奨。
- BR-60-03: 配信履歴を `announcements` テーブルに保持。
- BR-60-04: ユーザー側で「お知らせ未読」バッジ管理。

## 受入基準（AC）

### AC-60-01: 全体配信
```gherkin
When U-04 が「全ユーザーに本文 X」を配信（即時）
Then アプリ内バナーに表示
And メール一斉送信ジョブ投入（非同期）
```

### AC-60-02: セグメント配信
```gherkin
When 「facilities のみ」セグメント配信
Then U-02, U-06 のみ受信
```

### AC-60-03: 規約改定の 30 日告知
```gherkin
Given 運営が「利用規約改定」配信
Then 配信タイミング = 30 日後固定
And 30 日後にメールが届く
```

## サブ機能
- FR-60-1: セグメント配信
- FR-60-2: 履歴管理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
