# Astro Starter Kit: Basics

## 最新記事の自動更新

`npm run fetch-posts` で、技術ブログの最新3件を `src/data/posts.json`、
写真ブログの最新5件を `src/data/photo-posts.json` に保存します。
写真ブログは `https://nasuton.net/photo_gallery/feed/` のRSSから取得し、
一般タブの「撮影機材」と「各リンク」の間にある【作品紹介】に表示します。
タイトル・リンク・公開日・短い説明・取得できる画像を保存し、記事本文は保存しません。

GitHub Actionsではmainへのpush、毎週火曜9:10（日本時間）、手動実行時に
両方の記事データを更新してからビルドします。取得に失敗したブログは既存のJSONを保持します。
初回取得にも失敗し、JSONがない場合は空配列を作成してビルドを続行します。
GitHub Actions内の更新はデプロイ用で、JSONをリポジトリへ自動コミットしません。

写真ブログの取得先は環境変数 `PHOTO_POSTS_RSS_URL` で変更できます。
取得・解析・失敗時のデータ保持は `npm run test:posts` で検証できます。

## 関連記事インデックス（記事エクスプローラ）

`npm run build-related` で、技術ブログの全記事を RSS（`feed/?paged=N`）から取得し、
文字 2〜3-gram の TF-IDF + コサイン類似度で記事ごとに内容の近い上位5件を求めて
`src/data/related.json` に保存します。技術タブの【記事をさがす】に表示します。
コード・スクリプト・スタイルのブロックは類似度計算前に除去し、記事本文は保存しません
（保存するのはタイトル・URL・公開日・カテゴリ・関連記事のURLとスコアのみ）。

REST API は GitHub Actions のランナーから 403 になるため RSS を使っています。
GitHub Actions では `fetch-posts` の後に毎回再生成し、取得に失敗した場合や
取得件数が 140 件未満の場合は既存の `related.json` を保持します
（しきい値は環境変数 `RELATED_POSTS_MIN_COUNT` で変更できます）。

## Google Tag Manager

本番ビルドではコンテナ `GTM-NNMQ5QFQ` を読み込みます。
共通レイアウトのhead内にスクリプト、body開始直後にnoscriptを設置しています。
`npm run dev` での開発中は読み込みません。

### GitHub Pages

この変更をmainへ反映すると、通常のデプロイでGTMが有効になります。
別のコンテナに変更する場合は、リポジトリの
**Settings → Secrets and variables → Actions → Variables** で
Repository variable `PUBLIC_GTM_ID` にコンテナID（`GTM-` で始まるID）を設定できます。
変数が未設定または空の場合は `GTM-NNMQ5QFQ` を使います。
IDはビルド時にHTMLへ埋め込まれるため、変更後は
**Actions → Deploy to GitHub Pages → Run workflow** で再デプロイしてください。

### ローカルでの確認

`npm run build`、`npm run preview` の順に実行するとGTMを含むページを確認できます。
別のコンテナで確認する場合は `.env.example` を `.env` にコピーし、
`PUBLIC_GTM_ID` を変更してからビルドします。

設置後はGTMのプレビュー（Tag Assistant）で接続とタグの発火を確認し、
GTM管理画面で必要なタグを公開してください。GA4などの計測タグはGTM側で設定します。

設置位置は[Google公式の手順](https://support.google.com/tagmanager/answer/14847097?hl=ja)に従っています。

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
