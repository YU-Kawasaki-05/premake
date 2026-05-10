---
id: FR-84
title: 施設管理者・指示医の招待（法人から）
priority: P0
status: defined
related_users: [U-06]
related_screens: [SCR-32-org-invite]
related_features: [FR-02, FR-03, FR-87]
version: 1
---

# FR-84: 施設管理者・指示医の招待（法人から）

## 概要
法人管理者（U-06）が配下施設に対して U-02 施設管理者と U-03 指示医を招待する。FR-02 / FR-03 と同じ 4 経路（招待リンク / 招待コード / 申請型 / 運営代理）を法人ロールから実行可能にする。

## アクター
- U-06 法人管理者

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| invitee_role | enum | ○ | "facility_admin" / "doctor" |
| facility_id | uuid | ○ | 自法人配下 |
| email | string | ○ | RFC5322 |
| 氏名 | string | × | 招待表示用 |
| 経路 | enum | ○ | "link" / "code" |
| 期限 | datetime | × | デフォルト 72 時間 |

## 出力 / 結果
- 招待レコード `invitations` に INSERT（招待元 = U-06）
- メール送信（リンク経由）or 招待コード生成
- 受諾されたら FR-02 / FR-03 のフローに合流

## ビジネスルール
- BR-84-01: 招待先 facility は自法人配下のみ。
- BR-84-02: 同一メール+同一施設+同一ロールの未消化招待は 1 件のみ（重複時は既存招待を再送する形）。
- BR-84-03: 招待状況一覧で発行済 / 受諾済 / 失効を確認可能。
- BR-84-04: 招待取消（失効）は U-06 から可能。
- BR-84-05: 運営代理経路（FR-87）を法人管理者から運営に依頼できる UI を提供。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 法人配下でない facility 指定 | 403 |
| 同一招待が既に未消化 | 「既に招待が発行されています。再送しますか？」 |

## 受入基準（AC）

### AC-84-01: 法人から U-02 招待リンク発行
```gherkin
Given U-06 法人配下に F-001 がある
When U-06 が email "admin@hospital.jp" 宛に F-001 への施設管理者招待を発行
Then invitations テーブルに INSERT（inviter=U-06, role=facility_admin, facility_id=F-001）
And メール送信
```

### AC-84-02: 招待状況一覧
```gherkin
Given U-06 が 5 件の招待を発行済み（受諾 2 / 失効 1 / 未消化 2）
When 招待管理画面を開く
Then 5 件の状態が表示される
```

### AC-84-03: 招待取消
```gherkin
Given 未消化の招待 I-001
When U-06 が「取消」をクリック
Then invitations.status=revoked に更新
And 当該リンク / コードは即座に無効化
```

## サブ機能
- FR-84-1: 招待発行（リンク / コード）
- FR-84-2: 招待状況一覧
- FR-84-3: 招待取消・再送

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
