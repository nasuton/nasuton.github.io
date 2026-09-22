# Astro Starter Kit: Basics

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
