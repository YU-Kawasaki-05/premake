---
id: FR-30
title: 電子指示書 PDF 生成・保管
priority: P0
status: defined
related_users: []
related_screens: [SCR-52-prescription-view]
related_features: [FR-29, FR-77, FR-78]
version: 1
---

# FR-30: 電子指示書 PDF 生成・保管

## 概要
FR-29 で発行された指示書を、改ざん検証可能な PDF として生成・保管する。閲覧は権限内ユーザーに署名付き URL で配信。

## アクター
- システム（バックグラウンドジョブ）
- 閲覧側: U-01 看護師 / U-02 施設管理者 / U-03 指示医 / U-04 運営

## 入力データ
- prescription_id（FR-29 から）

## 出力 / 結果
- `prescription_pdfs` レコード作成（pdf_url, hash_sha256, signed_at, signature_x509）
- ストレージに PDF 保存（暗号化 at-rest）
- 閲覧用署名付き URL（5 分有効）配信

## ビジネスルール
- BR-30-01: PDF は 1 指示書 1 PDF。失効・再発行で別 PDF（チェーン化）。
- BR-30-02: PDF にはタイムスタンプ・指示医名・電子署名検証情報・QR コード（検証用 URL）を埋め込む。
- BR-30-03: PDF は **保存後に変更不可**（オブジェクトストレージで versioning + immutable lock）。
- BR-30-04: 保存期間は 7 年（医療記録保存義務）。期限経過後は legal hold がない限り削除可（ただしβ段階は無期限保管）。
- BR-30-05: 閲覧 URL は 5 分有効の署名付き、毎回再生成。
- BR-30-06: PDF アクセスは監査ログ（FR-76）に記録。

## エラーケース
| 条件 | 期待挙動 |
|------|----------|
| PDF 生成失敗 | リトライ（指数バックオフ）。3 回失敗で運営アラート |
| 署名検証失敗 | UI 上「検証エラー」表示、運営に通知 |

## 受入基準（AC）

### AC-30-01: PDF 自動生成
```gherkin
Given prescriptions レコード作成（FR-29）
When バックグラウンドジョブが処理
Then PDF が生成される
And prescription_pdfs に登録（hash_sha256, x509 署名情報）
And immutable lock がかかる
```

### AC-30-02: 閲覧時の署名付き URL
```gherkin
Given U-01 が予約詳細から指示書 PDF を開く
Then 5 分有効の署名付き URL が生成される
And 閲覧が監査ログに記録される
```

### AC-30-03: 改ざん検証
```gherkin
Given 保存済み PDF
When ユーザーが PDF を開く
Then UI で「電子署名検証: OK」が表示される
When PDF をオフラインで改ざん（hash 不一致）
Then 「検証エラー」表示、運営アラート
```

### AC-30-04: PDF への QR 検証埋め込み
```gherkin
Given 印刷された指示書 PDF
When 第三者が QR をスキャン
Then 検証専用 URL に遷移
And 「指示書 ID / 発行医師（マスキング） / 発行日時 / 署名検証」が表示される
But 個人情報（看護師・利用客）は表示されない
```

## サブ機能
- FR-30-1: PDF 生成バッチ
- FR-30-2: 署名付き URL 配信
- FR-30-3: 改ざん検証
- FR-30-4: QR コード公開検証エンドポイント

## 実装ステータス
- 実装ファイル: -
- テストファイル: -
- 最終確認 Sprint: -
