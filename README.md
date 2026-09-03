# Roxy Notice

YouTubeチャンネルのライブ配信枠・コミュニティ投稿、Xユーザーの投稿、ASMR作品の新着を確認し、サイト内通知とブラウザ通知で知らせる通知ハブです。

## 開発

```bash
npm install
npm run dev
```

設定画面の「YouTubeチャンネル」に、`@ハンドル`、`UC...`形式のチャンネルID、またはチャンネルURLを登録してください。登録件数に制限はありません。

Xは設定画面の「Xユーザー」に、`@ユーザー名`またはプロフィールURLを登録してください。登録件数に制限はありません。

ASMRは登録不要です。anime-sharing・vivahentai4u・erovoiceのRSSを5分ごとに確認し、RJ番号がある作品はDLsiteから声優・サークル・価格・ジャケット画像を補完します。

Splatoonは登録不要です。splatoon3.inkから現在のルール・ステージ名・ステージ画像・終了時刻を取得します。

## 本番起動

```bash
npm run build
npm start
```

既定では `http://localhost:4174` で起動します。ポートは `PORT` 環境変数で変更できます。

## GitHub Pagesで公開

`main` ブランチへpushすると、`.github/workflows/deploy-pages.yml` が静的フロントエンドをビルドしてGitHub Pagesへ公開します。

1. GitHubリポジトリの **Settings > Pages > Build and deployment > Source** を **GitHub Actions** にします。
2. Node APIをRender、Railway、Fly.ioなど、Node.jsを実行できるHTTPS環境へ公開します。
3. リポジトリの **Settings > Secrets and variables > Actions > Variables** に `API_BASE_URL` を追加し、APIサーバーのURL（例: `https://api.example.com`）を設定します。
4. APIサーバー側では `ALLOWED_ORIGINS=https://<ユーザー名>.github.io` を設定します。複数Originはカンマ区切りで指定できます。
5. `main` ブランチへpushし、Actionsの完了を待ちます。

GitHub Pagesは静的ホスティングのため、`server/` のAPIはPages上では動作しません。`API_BASE_URL` を未設定のまま公開すると画面は表示されますが、各通知APIへのアクセスは404になります。ローカル開発では未設定のままで従来どおり同一オリジンの `/api/*` を使用します。

## 通知の仕様

- `api/yt-api-wrapper` をサーバー側から使用します。YouTube APIキーは不要です。
- 画面を開いている間、60秒ごとに新しいライブ配信枠とコミュニティ投稿を確認します。
- ASMRは画面を開いている間、5分ごとに3サイトのRSSを確認します。初回表示時は既存作品を通知しません。
- Splatoonは60秒ごとに現在のステージを確認し、ローテーションが切り替わった時だけ通知します。
- 指定したXユーザー本人の投稿と返信を60秒ごとに確認します。リツイートは対象外です。
- 初回取得時の過去投稿は履歴として既読表示し、以後に見つかった新着だけを通知します。
- ブラウザ通知にはユーザーの許可が必要です。
- 非公式APIのため、YouTube側の仕様変更により取得できなくなる可能性があります。
