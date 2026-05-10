---
id: FR-52
title: レビュー公開・通報・モデレーション（β）
priority: P0
status: defined
beta: true
related_users: [U-01, U-02, U-04]
related_screens: [SCR-83-review-moderation]
related_features: [FR-49, FR-50, FR-51, FR-56]
version: 1
---

# FR-52: レビュー公開・通報・モデレーション（β）

## 概要
ユーザーが不適切なレビューを通報し、運営が確認・対応する。

## アクター
- 全ユーザー（通報）
- U-04 運営（モデレーション）

## 入力データ

### 通報
| review_id | uuid | ○ | - |
| 通報理由 | enum | ○ | "誹謗中傷" / "個人情報" / "虚偽" / "規約違反" / "その他" |
| 詳細 | string | × | 1〜1000 文字 |

### モデレーション
| review_id | uuid | ○ | - |
| action | enum | ○ | "keep" / "hide" / "remove" / "warn_author" |
| reason | string | ○ | 50〜2000 文字 |

## 出力 / 結果
- 通報レコード作成、レビューを「審査中」状態に
- 運営判断で keep / hide / remove
- 通報者・投稿者に結果通知

## ビジネスルール
- BR-52-01: 通報受付で即時に当該レビューは一覧から非表示。
- BR-52-02: 悪意の通報を防ぐため、同一通報者からの大量通報はレート制限 + 監視（1 日 5 件まで）。
- BR-52-03: モデレーション結果は監査ログに残す。
- BR-52-04: 警告（warn_author）は投稿者にメール、累積 3 回でアカウント警告フラグ。
- BR-52-05: remove は完全削除（ただし監査用ログは残る）、hide は非公開化のみ。

## 受入基準（AC）

### AC-52-01: 通報フロー
```gherkin
Given 公開レビュー
When ユーザーが「通報」+ 理由「個人情報」
Then 通報レコード作成
And レビューが審査中表示に変更
And 一覧から非表示
And 運営にアラート
```

### AC-52-02: モデレーション keep
```gherkin
Given 通報されたレビュー
When U-04 が「keep」+ 理由「適切な内容」
Then レビューが再公開
And 通報者にメール「審査結果: 問題なし」
```

### AC-52-03: モデレーション hide
```gherkin
When U-04 が「hide」+ 理由「個人情報を含む」
Then レビューが非公開化（一覧から消える）
And 投稿者に通知
```

### AC-52-04: 警告連動
```gherkin
Given 投稿者に warn_author が累積 3 回
Then users.warning_count=3
And 運営アラート（FR-56）+ 利用停止検討フラグ
```

### AC-52-05: 通報レート制限
```gherkin
Given 同一通報者が 1 日に 5 件通報済み
When 6 件目を試みる
Then 「本日の通報上限に達しました」
```

## サブ機能
- FR-52-1: 通報受付
- FR-52-2: モデレーション
- FR-52-3: 警告累積管理

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
