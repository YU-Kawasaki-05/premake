# premake オンボーディング資料

チームと自分のための、見やすい HTML 資料です。

| ファイル | 用途 | 誰向け |
|---|---|---|
| [`project-overview.html`](project-overview.html) | プロジェクト全体像(事業の狙い・意思決定の経緯・検証の進め方・技術構成・見るべき場所) | **仲間への共有用** |
| [`setup-guide.html`](setup-guide.html) | 立ち上げ手順(ローカル起動 → 本番サービス用意 → Vercel 公開) | あなた(セットアップ担当) |

## 見る方法

HTML なので **ブラウザで開く**と綺麗に表示されます(ライト/ダーク切替つき、外部依存なし)。

- **ローカル**: ファイルをダブルクリック、または VS Code の「Live Preview」拡張で開く。
- **GitHub 経由でそのまま見せたいとき**: GitHub は HTML を直接レンダリングしないため、以下のプレビュー経由リンクを共有すると1クリックで表示できます(公開リポジトリの場合)。
  - 全体像: `https://htmlpreview.github.io/?https://github.com/YU-Kawasaki-05/premake/blob/main/docs/onboarding/project-overview.html`
  - 手順: `https://htmlpreview.github.io/?https://github.com/YU-Kawasaki-05/premake/blob/main/docs/onboarding/setup-guide.html`
  - ※ 非公開リポジトリではプレビューサービスが読めないため、リポジトリをクローンしてローカルで開いてもらってください。

## 中身の一次情報

これらの HTML は下記ドキュメントの要約・図解です。詳細は各ファイルへ:

- 事業判断・経緯 … [`../06_単院MVP転換/`](../06_単院MVP転換/)
- 要件・データモデル・設計論点 … [`../10_v2_仕様/`](../10_v2_仕様/)
- 本番前タスク・Phase 2 … [`../30_申し送り/`](../30_申し送り/)
