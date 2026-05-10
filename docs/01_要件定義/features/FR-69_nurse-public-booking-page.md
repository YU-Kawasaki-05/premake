---
id: FR-69
title: 看護師の公開ブッキングページ
priority: P0
status: defined
related_users: [U-01]
related_screens: [SCR-120-public-booking-page]
related_features: [FR-39, FR-65, FR-70, FR-71, FR-88]
version: 1
---

# FR-69: 看護師の公開ブッキングページ

## 概要
看護師（U-01）が顧客（U-05）にシェアするための、自分専用の公開ブッキングページ。看護師がスペースで予約済みの枠から、利用客が個別予約を申し込める。

## アクター
- U-01 看護師（ページ管理）
- U-05 利用客（公開ページから予約）

## URL 構造
- `https://premake.example.com/n/{nurse_handle}` （nurse_handle はサインアップ時に決定する unique 文字列、3〜30 文字、英数字 + ハイフン）

## 設定項目（U-01 が編集）
| フィールド | 型 | 必須 | 制約 |
|-----------|---|------|------|
| プロフィール写真 | file | × | 5MB 以下 |
| 自己紹介 | string | × | 1〜2000 文字 |
| 提供メニュー（と料金）| array | ○ | { name, base_price, duration_min } の配列 |
| カウンセリング有無 / 必須/任意 | enum | ○ | "required" / "optional" / "none" |
| 事前決済設定 | enum | ○ | "required" / "optional" / "none" (FR-39) |
| 公開設定 | enum | ○ | "public" / "private (link only)" |
| キャンセルポリシー（看護師個別） | text | × | プラットフォームより厳格化のみ可（[仮決定]） |
| よくある質問 | array | × | - |

## 出力 / 結果
- `nurse_pages` レコード（owner=U-01）
- 公開 URL でアクセス可能（看護師の関連スペース予約から空き枠を計算）

## ビジネスルール
- BR-69-01: 公開ページは license_status=approved の看護師のみ公開可。
- BR-69-02: 空き枠は **看護師が予約済みのスペース枠** から派生（看護師が施術可能な時間 = スペースを確保している時間）。
- BR-69-03: 利用客向け料金 = メニュー料金（看護師が自由設定）。看護師のスペース利用料は別途 (FR-38)。
- BR-69-04: ページのカスタマイズは看護師のブランド表現を尊重しつつ、premake のロゴ・フッター（規約 / 特商法）は固定表示。
- BR-69-05: SEO: 看護師が「public」を選択すれば検索エンジン indexing 可。「private」はリンク経由のみアクセス可（noindex）。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| 看護師ハンドル重複 | 「このハンドルは既に使用されています」 |
| ハンドル形式不正 | 「英数字とハイフンのみ、3〜30 文字」 |

## 受入基準（AC）

### AC-69-01: ページ作成
```gherkin
Given U-01 (license_status=approved)
When ハンドル "yamada-nurse" + メニュー / 料金等を入力
Then nurse_pages 作成
And /n/yamada-nurse で公開
```

### AC-69-02: 空き枠連動
```gherkin
Given U-01 が 6/15 14-16 にスペースを予約済み（スペース利用料金 10000 円、メニュー「眉」料金 50000 円）
When 利用客が公開ページを開く
Then 6/15 14-16 が空き枠として表示（看護師のメニュー時間に合わせて分割）
```

### AC-69-03: private モード
```gherkin
Given private 設定
When 検索エンジンクローラ
Then noindex / nofollow メタ
But 直接 URL にアクセスすれば閲覧可
```

### AC-69-04: ハンドル変更
```gherkin
Given U-01 がハンドルを変更
Then 旧 URL は 24h 旧 → 新へ 301 リダイレクト
And その後失効
```

### AC-69-05: 公開条件
```gherkin
Given license_status=pending_review
When 公開を試みる
Then 「審査完了後に公開可能」エラー
```

## サブ機能
- FR-69-1: ページ編集
- FR-69-2: ハンドル管理 + リダイレクト
- FR-69-3: 公開 / 非公開
- FR-69-4: 空き枠計算ロジック

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
