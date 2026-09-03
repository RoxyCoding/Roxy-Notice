# Roxy Notice

YouTubeチャンネルの動画・ライブ配信、Xユーザーの投稿、ASMR作品の新着、Splatoon 3の現在のステージを知らせるGitHub Pages向け通知ハブです。

## 開発

```bash
npm install
npm run dev
```

ASMRは登録不要です。anime-sharing・vivahentai4u・erovoiceのRSSをGitHub Actionsで取得し、RJ番号がある作品はDLsiteから声優・サークル・価格・ジャケット画像を補完します。

Splatoonは登録不要です。splatoon3.inkから現在のルール・ステージ名・ステージ画像・終了時刻を取得します。

YouTubeは設定画面にYouTube Data API v3のAPIキーとチャンネルを登録します。APIキーはブラウザのlocalStorageだけに保存されます。Google Cloud側でHTTPリファラーを公開URLに制限してください。

Xは設定画面にユーザー名を登録します。公開タイムラインAPIをブラウザから直接利用します。

## 静的ビルド

```bash
npm run build
```

`dist/` にサーバー不要の静的ファイルを生成します。ASMRとSplatoonのJSONもビルド時に `dist/data/` へ同梱されます。

## GitHub Pagesで公開

`main` ブランチへpushすると、`.github/workflows/deploy-pages.yml` が静的フロントエンドをビルドしてGitHub Pagesへ公開します。GitHub Actionsは5分間隔でも実行され、静的データを更新します。

1. GitHubリポジトリの **Settings > Pages > Build and deployment > Source** を **GitHub Actions** にします。
2. `main` ブランチへpushし、Actionsの完了を待ちます。

実行時の独自APIサーバーと環境変数は不要です。YouTubeのみ、利用者自身のYouTube Data APIキーが必要です。

## 通知の仕様

- GitHub ActionsがASMRの静的データを定期生成します。GitHub側の混雑により更新が遅れる場合があります。
- 画面を開いている間、ASMRは5分ごとに公開済みデータを確認し、Splatoonは60秒ごとにsplatoon3.inkから直接取得します。
- YouTubeは公式Data APIを5分ごとに確認します。通常動画とライブ配信が対象で、コミュニティ投稿は公式APIの対象外です。
- Xは公開タイムラインAPIを60秒ごとに確認します。外部APIの仕様変更や制限により取得できない場合があります。
- ASMRは初回表示時の既存作品を通知しません。
- Splatoonはローテーションが切り替わった時だけ通知します。
- 初回取得時の過去投稿は履歴として既読表示し、以後に見つかった新着だけを通知します。
- ブラウザ通知にはユーザーの許可が必要です。
- 非公式APIのため、YouTube側の仕様変更により取得できなくなる可能性があります。
