# Tweet Viewer API Wrapper

Tweet Viewer の非公式 Node.js ラッパーです。ライブラリ、ローカル REST API、CLI の 3 通りの使い方ができます。

## 取得できるもの

| 機能 | メソッド |
| --- | --- |
| プロフィール | `getProfile()` |
| タイムライン（カーソル対応） | `getTimeline()` / `iterateTimeline()` |
| 最新ツイート | `getLatestTweet()` |
| 個別ツイート | `getTweet()` |
| メディアの URL 解決（画質別） | `resolveMedia()` |
| メディア本体の取得（ストリーミング可） | `fetchMedia()` |
| URL / ハンドルの自動判別 | `view()` |

## 必要環境

- Node.js 20 以上（依存パッケージなし）

## インストール

```bash
git clone <repository-url>
cd tweetviewer-api-wrapper
npm test
```

## ライブラリとして使う

```js
import { TweetViewerClient } from "./src/index.js";

const client = new TweetViewerClient();

// プロフィール
const profile = await client.getProfile("@RoxyCoding");
console.log(profile.displayName, profile.followers);

// タイムライン
const page = await client.getTimeline("@RoxyCoding");
console.log(page.tweets);

// 最新ツイート
const latest = await client.getLatestTweet("@RoxyCoding");
console.log(latest.text);

// 次のページ
if (page.cursor) {
  const nextPage = await client.getTimeline("RoxyCoding", { cursor: page.cursor });
  console.log(nextPage.tweets);
}

// 個別ツイート（ID でも URL でも可）
const tweet = await client.getTweet("https://x.com/RoxyCoding/status/2092592498862641403");
console.log(tweet.tweet.text);

// メディアの画質別 URL
const media = await client.resolveMedia("https://x.com/RoxyCoding/status/2083613866215289279");
console.log(media.variants); // 1080p、720p など
```

### メディアの取得

`fetchMedia()` は `Response` をそのまま返すため、全体読み込みとストリーミングのどちらにも対応できます。

```js
const response = await client.fetchMedia(media.variants[0].url, { range: "bytes=0-1023" });
const firstKilobyte = await response.arrayBuffer();
```

### 全ページの順次処理

```js
for await (const page of client.iterateTimeline("RoxyCoding", { maxPages: 3 })) {
  for (const tweet of page.tweets) console.log(tweet.id, tweet.text);
}
```

### クライアントのオプション

```js
const client = new TweetViewerClient({
  baseUrl: "https://tweetviewer.com",     // 既定値
  liveBaseUrl: "https://api.fxtwitter.com", // 既定値
  timeoutMs: 15_000,                        // 既定値
  headers: { "user-agent": "my-app/1.0" },
  fetch: myFetch,                           // テスト用の差し替え
});
```

すべてのメソッドは `signal` オプションで `AbortSignal` を受け取れます。

```js
const controller = new AbortController();
setTimeout(() => controller.abort(), 3000);
await client.getProfile("RoxyCoding", { signal: controller.signal });
```

### エラー処理

失敗時は `TweetViewerError` が投げられます。`status`、`code`、`details` を持ちます。

```js
import { TweetViewerClient, TweetViewerError } from "./src/index.js";

try {
  await client.getProfile("does-not-exist-handle");
} catch (error) {
  if (error instanceof TweetViewerError) {
    console.error(error.code, error.status, error.message);
  } else {
    throw error;
  }
}
```

主な `code`: `ABORTED`、`NETWORK_ERROR`、`INVALID_JSON`、`INVALID_LIVE_JSON`、`LIVE_API_ERROR`、`UNEXPECTED_RESPONSE`。

### タイムライン取得についての注意

タイムライン取得はリアルタイム専用です。`getTimeline()`、`iterateTimeline()`、`getLatestTweet()` は Tweet Viewer のページ内 JavaScript と同じライブ取得先（FxTwitter）へ直接アクセスし、Tweet Viewer 自身のキャッシュ付きタイムライン API は使いません。そのため、**接続元 IP と対象ハンドルが FxTwitter にも送信されます**。

`getLiveTimeline()` は互換性のために残した `getTimeline()` の別名です。

## ローカル REST API として使う

```bash
npm start
```

既定では `http://127.0.0.1:3000` で起動します。`HOST` と `PORT` で変更できます。

```bash
PORT=8080 npm start
```

### エンドポイント

| メソッド | パス | クエリ |
| --- | --- | --- |
| `GET` | `/health` | — |
| `GET` | `/v1/profiles/:handle` | — |
| `GET` | `/v1/profiles/:handle/timeline` | `cursor` |
| `GET` | `/v1/profiles/:handle/latest` | `includeReplies=0`、`includeRetweets=0` |
| `GET` | `/v1/tweets/:id` | — |
| `GET` | `/v1/media/resolve` | `url` または `id`、`lang` |
| `GET` | `/v1/media/file` | `url`（`Range` ヘッダー対応） |
| `POST` | `/v1/view` | ボディ `{"q":"..."}` |

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/v1/profiles/RoxyCoding
curl 'http://127.0.0.1:3000/v1/profiles/RoxyCoding/timeline'
curl 'http://127.0.0.1:3000/v1/profiles/RoxyCoding/timeline?cursor=取得したcursor'
curl 'http://127.0.0.1:3000/v1/profiles/RoxyCoding/latest?includeReplies=0'
curl http://127.0.0.1:3000/v1/tweets/2092592498862641403
curl 'http://127.0.0.1:3000/v1/media/resolve?id=2092592498862641403'
curl --get --data-urlencode 'url=https://pbs.twimg.com/media/example.png' \
  http://127.0.0.1:3000/v1/media/file --output media.bin
curl -X POST http://127.0.0.1:3000/v1/view \
  -H 'content-type: application/json' \
  -d '{"q":"@RoxyCoding"}'
```

エラー時は `{ "ok": false, "code": "...", "error": "..." }` を返します。

### サーバーを組み込む

CORS は既定で `*` を返します。`corsOrigin` で変更、`false` で無効化できます。

```js
import { createTweetViewerServer, TweetViewerClient } from "./src/index.js";

const server = createTweetViewerServer({
  client: new TweetViewerClient({ timeoutMs: 30_000 }),
  corsOrigin: "https://example.com",
});
server.listen(3000);
```

## CLI

```bash
node src/cli.js profile RoxyCoding
node src/cli.js timeline RoxyCoding [--cursor <cursor>]
node src/cli.js latest RoxyCoding [--exclude-replies] [--exclude-retweets]
node src/cli.js tweet 'https://x.com/RoxyCoding/status/2092592498862641403'
node src/cli.js resolve 'https://x.com/RoxyCoding/status/2083613866215289279' [--lang ja]
node src/cli.js view '@RoxyCoding'
```

結果は整形済み JSON で標準出力に、エラーは標準エラー出力に出力され、終了コードは `1` になります。

```bash
node src/cli.js latest RoxyCoding | jq -r '.text'
```

## テスト

```bash
npm test    # モック通信のみを使うテスト
npm run check  # 構文チェック
```

実サイトに対する簡易確認は次のように実行できます。

```bash
node src/cli.js profile RoxyCoding
```

## TypeScript

`src/index.d.ts` に型定義を同梱しています。`Profile`、`Tweet`、`Media`、`TimelineResponse`、`ResolveMediaResponse` などが利用できます。

```ts
import type { Tweet, Profile } from "./src/index.js";
```

## 注意事項
> このプロジェクトは Tweet Viewer および X Corp. とは無関係です。非公開・削除済み・閲覧制限付きのコンテンツにはアクセスできません。非公式エンドポイントを利用しているため、予告なく動作しなくなる可能性があります。取得したコンテンツは著作権・利用規約・対象サイトの負荷に配慮して利用してください。