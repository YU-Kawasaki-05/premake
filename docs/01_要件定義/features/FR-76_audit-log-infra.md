---
id: FR-76
title: 監査ログ収集基盤
priority: P0
status: defined
related_users: []
related_screens: []
related_features: [FR-59, FR-77, FR-78]
version: 1
---

# FR-76: 監査ログ収集基盤

## 概要
全ユーザー操作・データアクセス・運営アクションを記録する監査ログ基盤。FR-59 で運営が閲覧、各機能から書込み API を呼ぶ。

## アクター
- システム

## 記録対象（必須）
- 認証: login / logout / password_reset / mfa_setup
- ユーザーアクション: 申込・承認・指示書発行・施術記録投入・決済等
- データ閲覧: PII を含むデータ（個人情報・医療データ）の閲覧
- 運営アクション: 凍結・返金・代理オンボーディング・違反対応
- 失敗・エラー: 認可エラー・不正アクセス試行

## ログエントリ構造
| フィールド | 型 | 必須 |
|-----------|---|------|
| id | uuid | ○ |
| ts | timestamp | ○ |
| actor_type | enum | ○ | "user" / "system" / "ops" |
| actor_id | uuid | × | system イベント時は null |
| action | string | ○ | "login_success" 等 |
| target_type | string | × | "booking" / "user" 等 |
| target_id | uuid | × | - |
| ip / user_agent | string | × | - |
| details | jsonb | × | アクション固有データ |
| facility_id / org_id | uuid | × | テナント情報（フィルタ用） |

## ビジネスルール
- BR-76-01: 監査ログは **追記のみ**。編集・削除不可（DB 権限・トリガーで強制）。
- BR-76-02: 7 年保存（医療記録 + 一般法令）。
- BR-76-03: 高頻度書込みのため、ホット書込み → コールド層への定期アーカイブ（[仮決定]）。
- BR-76-04: PII を含むログは別格扱い（PII フラグ + 暗号化）。
- BR-76-05: 改ざん検知のためチェックサム / ハッシュチェーン（[仮決定]: blockchain ライク or 単純チェイニング）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| ログ書込み失敗 | 元アクションも失敗扱い（fail-fast、データ整合性優先） |
| ストレージ満杯 | 運営最高優先度アラート |

## 受入基準（AC）

### AC-76-01: ログ書込み
```gherkin
Given U-04 が U-01 の license image を閲覧 (FR-08)
Then audit_log に { actor=U-04, action=license_view, target=U-01 } 記録
And 元アクションが成功
```

### AC-76-02: 改ざん不可
```gherkin
Given audit_log エントリ
When DB 直接 UPDATE を試みる
Then DB トリガー / RLS で拒否
And 試行自体が監査ログに記録
```

### AC-76-03: ハッシュチェーン
```gherkin
Given audit_log の N 番目エントリ
Then 前のエントリのハッシュを含む
And 改ざん時にチェーン破綻で検出可
```

### AC-76-04: 定期検証
```gherkin
Given 日次バッチ
Then audit_log のチェーン整合性を検証
And 異常検出で運営アラート
```

## サブ機能
- FR-76-1: 書込み API
- FR-76-2: ハッシュチェーン
- FR-76-3: 定期整合性検証
- FR-76-4: アーカイブジョブ

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
