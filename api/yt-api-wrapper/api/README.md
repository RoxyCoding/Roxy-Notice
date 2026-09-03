# yt-api-wrapper

YouTube の**非公式** API ラッパー。API キーなしで、動画情報・検索・チャンネル・再生リスト・コメント・字幕・コミュニティ投稿・ライブチャット・ストリーム URL を取得できます。

クォータ制限はありません。

- 依存パッケージ **ゼロ**（Node 18+ の `fetch` のみ）
- TypeScript 製・型定義同梱
- CLI 同梱
- 最大 4K でのダウンロードに対応（[`examples/download.mjs`](examples/download.mjs)）

## インストール

```bash
npm install yt-api-wrapper
```

ローカル参照:

```bash
npm install /path/to/yt-api-wrapper
```

## クイックスタート

```ts
import { YouTube } from 'yt-api-wrapper';

const yt = new YouTube({ region: 'JP', language: 'ja' });

const video = await yt.getVideo('https://youtu.be/dQw4w9WgXcQ');
console.log(video.title, video.viewCount, video.likeCount);

const results = await yt.searchVideos('lofi hip hop', { limit: 10, sortBy: 'views' });
```

## API

コンストラクタは全て省略可能です。

```ts
new YouTube({
  region: 'JP',      // ISO 国コード（既定 'US'）
  language: 'ja',    // UI 言語（既定 'en'）
  timeout: 20000,    // ミリ秒（既定 20000）
  retries: 3,        // 5xx / 429 / タイムアウトの再試行回数（既定 3）
  cookie: '...',     // ログイン用（任意・上級者向け）
});
```

動画 ID は生の ID でも、`watch?v=` / `youtu.be` / `shorts` / `embed` / `live` のどの URL でも渡せます。
チャンネルは `UC...` ID、`@ハンドル`、`/c/名前`、URL のいずれでも構いません。

### 動画

```ts
await yt.getVideo(id, { withStreams: false });  // VideoDetails
await yt.getStreams(id);                        // StreamBundle（再生・DL 用 URL）
await yt.getRelated(id, { limit: 20 });         // 関連動画
await yt.getOEmbed(id);                         // 最軽量の存在確認
```

`getVideo` が返す主なフィールド:

| フィールド | 内容 |
| --- | --- |
| `title` / `description` | タイトル・概要欄全文 |
| `viewCount` / `likeCount` | 数値化済み（`1.2M` → `1200000`） |
| `durationSeconds` | 秒数（ライブ配信中は `null`） |
| `publishDate` | `YYYY-MM-DD` |
| `channel` | `{ id, name, url, thumbnails, verified }` |
| `chapters` | チャプター（`{ title, startSeconds }`） |
| `availableCaptions` | 利用可能な字幕トラック |
| `keywords` / `category` | タグ・カテゴリ |
| `isLive` / `isUpcoming` / `isPrivate` | 状態フラグ |

### 検索

```ts
await yt.search('query', {
  type: 'video',          // video | channel | playlist | movie | all
  uploadDate: 'week',     // hour | today | week | month | year
  duration: 'long',       // short | medium | long
  sortBy: 'views',        // relevance | date | views | rating
  features: ['hd', '4k', 'subtitles'],
  limit: 50,              // 必要なだけ自動でページングします
});

await yt.searchVideos('query', { limit: 20 });  // 動画のみ（型も絞られます）
await yt.getSuggestions('type');                // サジェスト候補
```

`search` は `VideoCompact | ChannelCompact | PlaylistCompact` の判別可能ユニオンを返すので、`type` で絞り込めます。

```ts
for (const item of await yt.search('lofi')) {
  if (item.type === 'video') console.log(item.durationSeconds);
}
```

### チャンネル

```ts
await yt.getChannel('@MrBeast');                        // ChannelDetails
await yt.getChannelVideos('@veritasium', { limit: 30 });
await yt.getChannelShorts('@MrBeast');
await yt.getChannelStreams('@MrBeast');
await yt.getChannelPlaylists('@veritasium', { limit: 30 });
await yt.resolveChannelId('@MrBeast');                  // → 'UCX6OQ3...'
```

`getChannel` の `hasMemberships` でメンバーシップの有無が分かります。

```ts
const c = await yt.getChannel('@MrBeast');
c.hasMemberships;  // true
```

ティア名や価格は未ログインでは取得できません。メンバー限定動画にアクセスした際の `MembersOnlyError.requiredTier` で、その動画に必要なランク名だけ分かります。
```

### コミュニティ投稿

```ts
const posts = await yt.getCommunityPosts('@veritasium', { limit: 20 });
posts[0].text;          // 本文（画像のみの投稿では空文字）
posts[0].images;        // 添付画像
posts[0].attachment;    // 共有された動画・再生リスト
posts[0].pollChoices;   // アンケートの選択肢
```

### ライブチャット

配信中・アーカイブどちらでも読めます。

```ts
let page = await yt.getLiveChat(videoId);

// 1回目はブートストラップで空になることが多く、2回目以降からメッセージが届きます
while (page.continuation) {
  await new Promise((r) => setTimeout(r, 3000));
  page = await yt.getLiveChat(videoId, page.continuation);

  for (const m of page.items) {
    console.log(m.author.name, m.text, m.purchaseAmount ?? '');
  }
}
```

発言者の属性も取れます。

```ts
m.isMember;               // メンバーかどうか
m.memberBadge;            // "メンバー（2 年）"
m.memberMonths;           // 24
m.memberBadgeThumbnails;  // バッジ画像（16px / 32px）
m.isModerator;            // モデレーター
m.isOwner;                // チャンネル主
m.purchaseAmount;         // スーパーチャットの金額（"¥500" など）
m.emojis;                 // 使われた絵文字・スタンプ
```

スタンプは本文にも `:_ふんふん:` の形で含まれます。`emojis` からは画像 URL も取れます。

```ts
for (const e of m.emojis) {
  e.shortcut;      // ":_ふんふん:"
  e.isCustom;      // チャンネル独自のスタンプなら true
  e.thumbnails[0]; // 画像 URL
}
```

### 再生リスト

```ts
const pl = await yt.getPlaylist('PLxxxx', { limit: 200 });
console.log(pl.title, pl.videoCount, pl.videos.length);
```

### コメント

```ts
const comments = await yt.getComments(id, { limit: 100, sortBy: 'top' });

// 返信は取得したコメントのトークンから辿ります
if (comments[0].repliesToken) {
  await yt.getCommentReplies(comments[0].repliesToken);
}
```

### 字幕・文字起こし

```ts
await yt.getCaptions(id);            // 利用可能なトラック一覧
await yt.getTranscript(id, 'ja');    // [{ text, startSeconds, durationSeconds }]
```

言語を省略すると 手動字幕 → 自動生成字幕 の順で選ばれます。

### 人気の動画

公式チャート（急上昇の後継）から取得します。

```ts
await yt.getTrending('now', { limit: 50 });   // now | music | gaming | movies
```

### ストリーム URL

```ts
const streams = await yt.getStreams(id);

streams.progressive;      // 映像+音声が 1 ファイル（そのまま再生可能）
streams.adaptive;         // 高画質・高音質（映像と音声が別）
streams.hlsManifestUrl;   // ライブ配信用
streams.expiresInSeconds; // URL の有効期限
```

最高画質を選ぶ例:

```ts
const bestVideo = streams.adaptive
  .filter((f) => f.kind === 'video')
  .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

const bestAudio = streams.adaptive
  .filter((f) => f.kind === 'audio')
  .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
```

URL は数時間で失効します（`expiresInSeconds` を参照）。取得したらすぐ使ってください。

**ダウンロード時の注意:**

- `adaptive` 形式は `Range` ヘッダーが必須です。付けずに全体を要求すると 403 が返ります。2MB 程度に分割して取得してください
- リクエストには取得時と同じ User-Agent を送ってください（既定では VISIONOS クライアントのもの）
- `adaptive` は映像と音声が別ファイルなので、`ffmpeg` での結合が必要です

ダウンローダーの実装例: [`examples/download.mjs`](examples/download.mjs)

```bash
node examples/download.mjs "https://www.youtube.com/watch?v=Rsfwu-c5S14"
# → download/ に 4K で保存されます

node examples/download.mjs "<URL>" 出力名 --dir ~/Movies
```

### 低レベル API

ライブラリが未対応のデータを取得する場合に使います。

```ts
await yt.raw('browse', { browseId: 'FEwhat_to_watch' });  // InnerTube を直接叩く
await yt.getRawPageData('/results?search_query=test');    // ytInitialData を取得
```

## エラー処理

すべて `YouTubeError` を継承しています。

```ts
import {
  UnavailableError,
  MembersOnlyError,
  NetworkError,
  ParseError,
  InvalidArgumentError,
} from 'yt-api-wrapper';

try {
  await yt.getVideo(id);
} catch (error) {
  if (error instanceof MembersOnlyError) {
    // メンバー限定。error.requiredTier に必要なランク名が入ります
  } else if (error instanceof UnavailableError) {
    // 非公開・削除済み・地域制限
  } else if (error instanceof NetworkError) {
    // 通信失敗（5xx / 429 は自動再試行済み）
  }
}
```

| クラス | 発生条件 |
| --- | --- |
| `InvalidArgumentError` | ID や URL の形式が不正 |
| `UnavailableError` | 動画・チャンネルが取得不可 |
| `MembersOnlyError` | メンバー限定動画（`UnavailableError` を継承） |
| `NetworkError` | 通信失敗・HTTP エラー |
| `ParseError` | YouTube のレスポンス構造が変化 |

## CLI

```bash
npx yt-api video dQw4w9WgXcQ
npx yt-api search "lofi hip hop" --limit 5 --type video
npx yt-api channel @MrBeast
npx yt-api channel-videos @veritasium --limit 10
npx yt-api playlist PLxxxx --limit 50
npx yt-api comments dQw4w9WgXcQ --limit 20 --sort newest
npx yt-api transcript dQw4w9WgXcQ --lang ja
npx yt-api streams dQw4w9WgXcQ
npx yt-api trending music
npx yt-api suggest "rust async"
npx yt-api related dQw4w9WgXcQ --limit 10
```

結果は JSON で標準出力に出ます。

```bash
# タイトルだけ一覧にする
npx yt-api search "typescript" --limit 20 | jq -r '.[].title'

# 再生数の多い順に並べる
npx yt-api channel-videos @HikakinTV --limit 100 \
  | jq -r 'sort_by(-.viewCount)[] | "\(.viewCount)\t\(.title)"' | head

# CSV に変換する
npx yt-api channel-videos @veritasium --limit 200 \
  | jq -r '["再生数","タイトル"], (.[]|[.viewCount,.title]) | @csv' > out.csv
```

グローバルオプション: `--region JP` `--language ja`

## 仕組みと注意点

InnerTube（YouTube アプリ内部の JSON API）に、公式クライアントを名乗ってリクエストしています。

### クライアントの使い分け

エンドポイントごとに通るクライアントが違います。

| 用途 | クライアント | 理由 |
| --- | --- | --- |
| 動画情報・ストリーム | VISIONOS → ANDROID → IOS → TV → WEB | 上から順に試し、`OK` を返したものを採用 |
| 検索・チャンネル・再生リスト | WEB | メタデータが最も充実している |

匿名の `WEB` クライアントは `player` に対して `UNPLAYABLE` を返すため、YouTube のトップページから訪問者 ID（`visitorData`）を取得して添付しています。

**VISIONOS** を最優先にしているのは、一部の動画が ANDROID / IOS では約 1 分ぶんで 403 に遮断されるためです。VISIONOS は「子ども向け」設定の動画を扱えないので、その場合は次のクライアントへフォールバックします。

**これは非公式の手法です。**

- YouTube 側の仕様変更で予告なく壊れる可能性があります（その場合 `ParseError` が出ます）。特にクライアントのバージョン定数は定期的な更新が必要です
- 短時間に大量のリクエストを送ると一時的にブロックされます。並列数を抑えてください
- YouTube の利用規約を確認したうえで、自己責任でご利用ください
- 業務・商用の用途では公式 [YouTube Data API](https://developers.google.com/youtube/v3) を検討してください

## 開発

```bash
npm install
npm run build

node examples/basic.mjs                                    # 各機能のデモ
node examples/download.mjs "https://youtu.be/Rsfwu-c5S14"  # ダウンロード
```

`download.mjs` には `ffmpeg` が必要です（`brew install ffmpeg`）。360p のみなら不要です。

## ライセンス

MIT
