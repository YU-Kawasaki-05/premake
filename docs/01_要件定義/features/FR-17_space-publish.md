---
id: FR-17
title: スペース公開・非公開切替
priority: P0
status: defined
related_users: [U-02, U-06]
related_screens: [SCR-21-space-create, SCR-24-space-list]
related_features: [FR-14, FR-19]
version: 1
---

# FR-17: スペース公開・非公開切替

## 概要
スペースを「公開（看護師の検索結果に出る）」「非公開（出ない）」に切替える。新規スペースは draft 状態で作成され、明示的に公開される。

## アクター
- U-02 施設管理者
- U-06 法人管理者

## 入力データ
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| space_id | uuid | ○ | - |
| status | enum | ○ | "published" / "unpublished" |
| 非公開理由 | string | × | 内部メモ |

## 出力 / 結果
- `spaces.status` を更新
- 検索インデックス（FR-19）の reindex キューに投入

## ビジネスルール
- BR-17-01: 公開条件: facility が approved + プロフィール完備（FR-13） + スペース必須項目完備（FR-14） + 料金設定済み（FR-15） + 空き枠ルール 1 件以上（FR-16）。
- BR-17-02: 公開条件未達のスペースは公開不可。UI 上に未達項目をリスト表示。
- BR-17-03: 非公開化は即時反映。新規予約申込は不可、既予約は保持。
- BR-17-04: 削除（FR-14）と非公開は別概念（非公開 = 一時停止、削除 = 恒久）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 公開条件未達 | 「以下の項目を完了してください: 写真未登録 / 料金未設定 / ...」 |

## 受入基準（AC）

### AC-17-01: 正常系（公開）
```gherkin
Given スペース S-001 が draft 状態
And 公開条件をすべて満たしている
When U-02 が「公開」を選択
Then spaces.status=published に更新
And 検索インデックスに登録される
And 検索結果に表示されるようになる
```

### AC-17-02: 公開条件未達
```gherkin
Given スペース S-001 で写真が未アップロード
When U-02 が「公開」を選択
Then エラー「写真を 1 枚以上アップロードしてください」
And status は draft のまま
```

### AC-17-03: 非公開化
```gherkin
Given スペース S-001 が published、既予約 3 件
When U-02 が「非公開」を選択
Then status=unpublished に更新
And 検索結果から消える
And 既予約 3 件は保持される
```

## サブ機能
- FR-17-1: 公開条件チェック
- FR-17-2: 公開・非公開切替

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
