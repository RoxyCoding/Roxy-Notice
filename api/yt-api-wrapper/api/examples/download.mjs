// 動画をダウンロードする例
//   node examples/download.mjs <URL または ID> [出力名] [--dir <保存先>]
//
// 既定の保存先はリポジトリ直下の download/ です。
// 高画質は映像と音声が別ファイルなので ffmpeg で結合します。
// progressive（360p以下）だけで良ければ ffmpeg は不要です。
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  InvalidArgumentError,
  NetworkError,
  UnavailableError,
  YouTube,
} from '../dist/index.js';

const args = process.argv.slice(2);

// --dir <path> を抜き出し、残りを位置引数として扱う。
let outDir = null;
const dirFlag = args.indexOf('--dir');
if (dirFlag !== -1) {
  outDir = args[dirFlag + 1];
  if (!outDir) {
    console.error('--dir には保存先のパスを指定してください');
    process.exit(1);
  }
  args.splice(dirFlag, 2);
}

const [input, outName] = args;
if (!input) {
  console.error('使い方: node examples/download.mjs <URL または ID> [出力名] [--dir <保存先>]');
  process.exit(1);
}

// 既定はリポジトリ直下の download/。このスクリプトの場所を基準にするので、
// どこから実行しても同じ場所に保存される。
const targetDir = resolve(outDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'download'));
await mkdir(targetDir, { recursive: true });

const yt = new YouTube({ region: 'JP', language: 'ja' });

let info;
let streams;
try {
  info = await yt.getVideo(input);
  streams = await yt.getStreams(input);
} catch (error) {
  if (error instanceof InvalidArgumentError) {
    console.error(`動画 ID を読み取れませんでした: ${input}`);
    console.error('例: node examples/download.mjs "https://www.youtube.com/watch?v=Rsfwu-c5S14"');
  } else if (error instanceof UnavailableError) {
    console.error(`この動画は取得できません（非公開・削除済み・地域制限のいずれか）: ${input}`);
  } else if (error instanceof NetworkError) {
    console.error(`YouTube への接続に失敗しました: ${error.message}`);
  } else {
    throw error;
  }
  process.exit(1);
}
const safeName = (outName ?? info.title).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80);
const outPath = join(targetDir, `${safeName}.mp4`);

console.log(`タイトル: ${info.title}`);
console.log(`保存先  : ${targetDir}`);

// 最高画質の映像と、最高音質の音声をそれぞれ選ぶ
const video = streams.adaptive
  .filter((f) => f.kind === 'video' && f.url)
  .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
const audio = streams.adaptive
  .filter((f) => f.kind === 'audio' && f.url)
  .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

/** URL をファイルに保存し、進捗を1行で表示する。 */
// ストリーム URL は発行元クライアントの User-Agent で取りにいく。
// getStreams は VISIONOS を優先して使うので、それに合わせる。
// また adaptive 形式は Range ヘッダー必須で、付けずに全体を要求すると
// 403 が返る（progressive は付けなくても通る）。
const STREAM_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15' +
    ' (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

// 大きすぎるチャンクは弾かれやすいので控えめに刻む。
const CHUNK_SIZE = 2 * 1024 * 1024;

/** URL を Range で分割取得してファイルに保存し、進捗を1行で表示する。 */
async function download(format, path, label) {
  // まず 1 バイトだけ要求して全体サイズを確定させる。
  const probe = await fetch(format.url, {
    headers: { ...STREAM_HEADERS, Range: 'bytes=0-0' },
  });
  if (!probe.ok) throw new Error(`${label}: HTTP ${probe.status}`);

  const total =
    Number(probe.headers.get('content-range')?.split('/')[1]) ||
    format.contentLength ||
    0;
  if (!total) throw new Error(`${label}: サイズを取得できませんでした`);

  const out = createWriteStream(path);
  let done = 0;

  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, total - 1);

    // 連続で取りにいくと途中から 403 を返してくることがあるので、
    // 少し待って掴み直す。URL 自体が失効したわけではない。
    let response;
    for (let attempt = 0; ; attempt++) {
      response = await fetch(format.url, {
        headers: { ...STREAM_HEADERS, Range: `bytes=${start}-${end}` },
      });
      if (response.ok) break;
      if (attempt >= 4) {
        throw new ThrottledError(
          `${label}: ${(start / 1e6).toFixed(1)}MB 地点で YouTube に遮断されました` +
            `（HTTP ${response.status}）`,
          done,
          total,
        );
      }

      process.stdout.write(`\r  ${label}: 再試行 ${attempt + 1}/4 ...          `);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }

    // pipeline を毎チャンク呼ぶと close リスナーが積み上がって警告が出るので、
    // バッファを直接 write して排出を待つ。
    const chunk = Buffer.from(await response.arrayBuffer());
    if (!out.write(chunk)) {
      await new Promise((resolve) => out.once('drain', resolve));
    }

    done = end + 1;
    process.stdout.write(
      `\r  ${label}: ${(done / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)}MB` +
        ` (${Math.round((done / total) * 100)}%)   `,
    );
  }

  await new Promise((resolve, reject) => {
    out.on('error', reject);
    out.end(resolve);
  });
  process.stdout.write(`\r  ${label}: ${(total / 1e6).toFixed(1)}MB 完了          \n`);
}

/** YouTube が転送を打ち切ったことを表す。progressive へ切り替える合図。 */
class ThrottledError extends Error {
  constructor(message, downloaded, total) {
    super(message);
    this.downloaded = downloaded;
    this.total = total;
  }
}

/** ffmpeg で映像と音声を1つの mp4 にまとめる（再エンコードなし）。 */
function merge(videoPath, audioPath, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c', 'copy',            // 再エンコードしないので一瞬で終わる
      '-movflags', '+faststart',
      outPath,
    ]);
    ff.stderr.on('data', (d) => process.stderr.write(d));
    ff.on('error', reject);
    ff.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg が ${code} で終了しました`)),
    );
  });
}

/** 映像+音声が一体の progressive 形式を1本で落とす。画質は 360p 程度。 */
async function downloadProgressive() {
  const single = streams.progressive.find((f) => f.url);
  if (!single) throw new Error('ダウンロード可能な形式が見つかりませんでした');

  console.log(`画質: ${single.qualityLabel}（映像+音声一体）\n`);

  // progressive は contentLength が付かないことがあるので一括で取る。
  const response = await fetch(single.url, { headers: STREAM_HEADERS });
  if (!response.ok) throw new Error(`動画: HTTP ${response.status}`);

  await pipeline(Readable.fromWeb(response.body), createWriteStream(outPath));
  console.log(`保存しました: ${outPath}`);
}

if (video && audio) {
  console.log(`画質: ${video.qualityLabel} + 音声 ${Math.round((audio.bitrate ?? 0) / 1000)}kbps\n`);

  const vTmp = join(targetDir, `.${safeName}.video`);
  const aTmp = join(targetDir, `.${safeName}.audio`);

  try {
    await download(video, vTmp, '映像');
    await download(audio, aTmp, '音声');

    console.log('\n結合中...');
    await merge(vTmp, aTmp, outPath);
    console.log(`保存しました: ${outPath}`);
  } catch (error) {
    if (!(error instanceof ThrottledError)) throw error;

    // 一部の動画は高画質側だけ強く絞られる。低画質だが確実に落ちる
    // progressive に切り替えたほうが、何も残らないよりましなので続行する。
    console.error(`\n${error.message}`);
    console.error('高画質の取得を諦めて、低画質版に切り替えます。\n');
    await downloadProgressive();
  } finally {
    await Promise.all([unlink(vTmp).catch(() => {}), unlink(aTmp).catch(() => {})]);
  }
} else {
  await downloadProgressive();
}
