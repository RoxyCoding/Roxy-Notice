#!/usr/bin/env node
import { YouTube } from './client.js';
import { YouTubeError } from './errors.js';

const USAGE = `yt-api — unofficial YouTube API wrapper

Usage:
  yt-api video <id|url> [--streams]
  yt-api search <query> [--type video|channel|playlist] [--limit N] [--sort date|views|rating]
  yt-api channel <id|@handle|url>
  yt-api channel-videos <id|@handle|url> [--limit N]
  yt-api playlist <id|url> [--limit N]
  yt-api comments <id|url> [--limit N] [--sort top|newest]
  yt-api transcript <id|url> [--lang ja]
  yt-api streams <id|url>
  yt-api trending [now|music|gaming|movies] [--limit N]
  yt-api suggest <query>

Global options:
  --region XX     ISO country code (default US)
  --language xx   UI language (default en)
  --json          Print raw JSON (default; kept for clarity)
`;

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  }

  return { command: positional.shift() ?? '', positional, flags };
}

function num(value: string | boolean | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || flags.help) {
    process.stdout.write(USAGE);
    return;
  }

  const yt = new YouTube({
    region: typeof flags.region === 'string' ? flags.region : undefined,
    language: typeof flags.language === 'string' ? flags.language : undefined,
  });

  const target = positional[0];
  const limit = num(flags.limit);
  const requireTarget = (): string => {
    if (!target) throw new YouTubeError(`${command} requires an argument — see 'yt-api help'`);
    return target;
  };

  let result: unknown;

  switch (command) {
    case 'video':
      result = await yt.getVideo(requireTarget(), { withStreams: flags.streams === true });
      break;
    case 'search':
      result = await yt.search(positional.join(' '), {
        type: flags.type as any,
        sortBy: flags.sort as any,
        limit,
      });
      break;
    case 'channel':
      result = await yt.getChannel(requireTarget());
      break;
    case 'channel-videos':
      result = await yt.getChannelVideos(requireTarget(), { limit });
      break;
    case 'playlist':
      result = await yt.getPlaylist(requireTarget(), { limit });
      break;
    case 'comments':
      result = await yt.getComments(requireTarget(), { limit, sortBy: flags.sort as any });
      break;
    case 'transcript':
      result = await yt.getTranscript(requireTarget(), typeof flags.lang === 'string' ? flags.lang : undefined);
      break;
    case 'streams':
      result = await yt.getStreams(requireTarget());
      break;
    case 'trending':
      result = await yt.getTrending((target as any) ?? 'now', { limit });
      break;
    case 'suggest':
      result = await yt.getSuggestions(positional.join(' '));
      break;
    case 'related':
      result = await yt.getRelated(requireTarget(), { limit });
      break;
    default:
      process.stderr.write(`unknown command: ${command}\n\n${USAGE}`);
      process.exitCode = 1;
      return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
});
