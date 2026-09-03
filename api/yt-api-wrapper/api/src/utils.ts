import { InvalidArgumentError } from './errors.js';

const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const PLAYLIST_ID = /^(?:PL|UU|LL|RD|OL|FL|TL|WL)[\w-]+$/;

/**
 * Accept a bare video id or any YouTube URL shape (watch, youtu.be, shorts,
 * embed, live) and return the 11-character id.
 */
export function parseVideoId(input: string): string {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith('http') ? value : `https://${value}`);
  } catch {
    throw new InvalidArgumentError(`not a valid video id or URL: ${input}`);
  }

  const fromQuery = url.searchParams.get('v');
  if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;

  const segments = url.pathname.split('/').filter(Boolean);
  if (url.hostname.endsWith('youtu.be') && segments[0] && VIDEO_ID.test(segments[0])) {
    return segments[0];
  }

  const prefixed = ['shorts', 'embed', 'live', 'v'];
  if (prefixed.includes(segments[0]) && segments[1] && VIDEO_ID.test(segments[1])) {
    return segments[1];
  }

  throw new InvalidArgumentError(`could not find a video id in: ${input}`);
}

/**
 * Accept a channel id, @handle, /c/ vanity name, or channel URL.
 * Returns a discriminated descriptor because handles need an extra resolve step.
 */
export function parseChannelInput(input: string):
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'vanity'; value: string } {
  const value = input.trim();
  if (CHANNEL_ID.test(value)) return { kind: 'id', value };
  if (value.startsWith('@')) return { kind: 'handle', value: value.slice(1) };

  if (!value.includes('/')) return { kind: 'vanity', value };

  let url: URL;
  try {
    url = new URL(value.startsWith('http') ? value : `https://${value}`);
  } catch {
    throw new InvalidArgumentError(`not a valid channel id or URL: ${input}`);
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'channel' && segments[1]) {
    if (!CHANNEL_ID.test(segments[1])) {
      throw new InvalidArgumentError(`malformed channel id: ${segments[1]}`);
    }
    return { kind: 'id', value: segments[1] };
  }
  if (segments[0]?.startsWith('@')) return { kind: 'handle', value: segments[0].slice(1) };
  if ((segments[0] === 'c' || segments[0] === 'user') && segments[1]) {
    return { kind: 'vanity', value: segments[1] };
  }

  throw new InvalidArgumentError(`could not find a channel in: ${input}`);
}

/** Accept a playlist id or any URL containing `list=`. */
export function parsePlaylistId(input: string): string {
  const value = input.trim();
  if (PLAYLIST_ID.test(value) && !value.includes('/')) return value;

  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    const list = url.searchParams.get('list');
    if (list) return list;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'playlist' && segments[1]) return segments[1];
  } catch {
    // fall through to the error below
  }

  throw new InvalidArgumentError(`could not find a playlist id in: ${input}`);
}

/** Canonical watch URL for a video id. */
export function videoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Canonical playlist URL. */
export function playlistUrl(id: string): string {
  return `https://www.youtube.com/playlist?list=${id}`;
}

/** Canonical channel URL. */
export function channelUrl(id: string): string {
  return `https://www.youtube.com/channel/${id}`;
}

/**
 * Highest-resolution thumbnail URL for a video, without a network round trip.
 * `maxresdefault` only exists for some videos; `hqdefault` always does.
 */
export function thumbnailUrl(videoId: string, quality: 'max' | 'sd' | 'hq' | 'mq' | 'default' = 'hq'): string {
  const names = { max: 'maxresdefault', sd: 'sddefault', hq: 'hqdefault', mq: 'mqdefault', default: 'default' };
  return `https://i.ytimg.com/vi/${videoId}/${names[quality]}.jpg`;
}
