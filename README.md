# Roxy Notice

ASMR作品の新着とSplatoon 3の現在のステージを、サイト内通知とブラウザ通知で知らせるGitHub Pages向け通知ハブです。

## 開発

```bash
npm install
npm run dev
```

ASMRは登録不要です。anime-sharing・vivahentai4u・erovoiceのRSSをGitHub Actionsで取得し、RJ番号がある作品はDLsiteから声優・サークル・価格・ジャケット画像を補完します。

Splatoonは登録不要です。splatoon3.inkから現在のルール・ステージ名・ステージ画像・終了時刻を取得します。

## 静的ビルド

```bash
npm run build
```

`dist/` にサーバー不要の静的ファイルを生成します。ASMRとSplatoonのJSONもビルド時に `dist/data/` へ同梱されます。

## GitHub Pagesで公開

`main` ブランチへpushすると、`.github/workflows/deploy-pages.yml` が静的フロントエンドをビルドしてGitHub Pagesへ公開します。GitHub Actionsは5分間隔でも実行され、静的データを更新します。

1. GitHubリポジトリの **Settings > Pages > Build and deployment > Source** を **GitHub Actions** にします。
2. `main` ブランチへpushし、Actionsの完了を待ちます。

実行時のAPIサーバー、環境変数、APIキーは不要です。YouTubeとXは、ブラウザごとの登録内容を代理取得するサーバーが必要になるため、サーバー不要版では対象外です。

## 通知の仕様

- GitHub Actionsが5分ごとにASMRとSplatoonの静的データを生成します。GitHub側の混雑により更新が遅れる場合があります。
- 画面を開いている間、ASMRは5分ごと、Splatoonは60秒ごとに公開済みデータの更新を確認します。
- ASMRは初回表示時の既存作品を通知しません。
- Splatoonはローテーションが切り替わった時だけ通知します。
- 初回取得時の過去投稿は履歴として既読表示し、以後に見つかった新着だけを通知します。
- ブラウザ通知にはユーザーの許可が必要です。
- 非公式APIのため、YouTube側の仕様変更により取得できなくなる可能性があります。
