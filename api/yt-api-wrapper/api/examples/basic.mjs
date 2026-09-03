// Run with: node examples/basic.mjs
import { YouTube, formatDuration } from '../dist/index.js';

const yt = new YouTube({ region: 'JP', language: 'ja' });

// 1. Video metadata
const video = await yt.getVideo('https://youtu.be/dQw4w9WgXcQ');
console.log(`\n[動画] ${video.title}`);
console.log(`  チャンネル : ${video.channel?.name}`);
console.log(`  再生数     : ${video.viewCount?.toLocaleString()}`);
console.log(`  高評価     : ${video.likeCount?.toLocaleString()}`);
console.log(`  長さ       : ${formatDuration(video.durationSeconds ?? 0)}`);
console.log(`  投稿日     : ${video.publishDate}`);

// 2. Search with filters
console.log('\n[検索] "lofi hip hop" 再生数順');
for (const item of await yt.searchVideos('lofi hip hop', { limit: 5, sortBy: 'views' })) {
  console.log(`  ${item.title.slice(0, 40)} — ${item.viewCount?.toLocaleString()} views`);
}

// 3. Channel
const channel = await yt.getChannel('@MrBeast');
console.log(`\n[チャンネル] ${channel.name} — 登録者 ${channel.subscriberCount?.toLocaleString()}`);

// 4. Comments
console.log('\n[コメント]');
for (const comment of await yt.getComments('dQw4w9WgXcQ', { limit: 3 })) {
  console.log(`  ${comment.author.name}: ${comment.text.slice(0, 50)} (♥${comment.likeCount})`);
}

// 5. Transcript
const transcript = await yt.getTranscript('dQw4w9WgXcQ', 'en');
console.log(`\n[字幕] ${transcript.length} 行`);
console.log(`  ${transcript[1]?.startSeconds}s: ${transcript[1]?.text}`);

// 6. Streams
const streams = await yt.getStreams('dQw4w9WgXcQ');
const best = streams.adaptive
  .filter((f) => f.kind === 'video')
  .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
console.log(`\n[ストリーム] ${streams.formats.length} 形式 / 最高画質 ${best?.qualityLabel}`);
console.log(`  有効期限: ${streams.expiresInSeconds}秒`);
