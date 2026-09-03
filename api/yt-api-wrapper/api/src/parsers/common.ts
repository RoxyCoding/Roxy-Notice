import type { ChannelRef, Thumbnail } from '../types/index.js';

/** Flatten YouTube's `{ simpleText }` / `{ runs: [...] }` text shapes to a string. */
export function readText(node: any): string | null {
  if (node == null) return null;
  if (typeof node === 'string') return node;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) {
    return node.runs.map((run: any) => run?.text ?? '').join('');
  }
  if (node.content != null) return readText(node.content);
  return null;
}

/** Same as `readText` but never null. */
export function readTextOr(node: any, fallback = ''): string {
  return readText(node) ?? fallback;
}

/** Normalise a thumbnail container into a width-ascending list. */
export function readThumbnails(node: any): Thumbnail[] {
  const list =
    node?.thumbnails ??
    node?.sources ??
    node?.thumbnail?.thumbnails ??
    node?.thumbnail?.sources ??
    (Array.isArray(node) ? node : null);
  if (!Array.isArray(list)) return [];

  return list
    .filter((item: any) => typeof item?.url === 'string')
    .map((item: any) => ({
      url: item.url.startsWith('//') ? `https:${item.url}` : item.url,
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
    }))
    .sort((a, b) => a.width - b.width);
}

/**
 * Parse counts YouTube renders as prose: "1,234,567 views", "1.2M subscribers",
 * "2.3万 回視聴". Returns null when no number can be recovered.
 */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;

  const cleaned = text.replace(/,/g, '').replace(/ /g, ' ');
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*([KMBkmb万億千]?)/);
  if (!match) return null;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  const multipliers: Record<string, number> = {
    K: 1e3, k: 1e3,
    M: 1e6, m: 1e6,
    B: 1e9, b: 1e9,
    千: 1e3,
    万: 1e4,
    億: 1e8,
  };
  return Math.round(value * (multipliers[match[2]] ?? 1));
}

/** Parse "1:02:03" / "4:05" / "45" into seconds. */
export function parseDuration(text: string | null | undefined): number | null {
  if (!text) return null;
  const parts = text.trim().split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return null;

  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Format seconds back into "1:02:03". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Pull a channel id out of any of the navigation shapes YouTube uses. */
export function readChannelId(node: any): string | null {
  return (
    node?.navigationEndpoint?.browseEndpoint?.browseId ??
    node?.browseEndpoint?.browseId ??
    node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url?.match(/\/channel\/(UC[\w-]+)/)?.[1] ??
    null
  );
}

/** Build a `ChannelRef` from an owner/byline renderer. */
export function readChannelRef(node: any, thumbnails: any = null): ChannelRef | null {
  if (!node) return null;

  const run = node?.runs?.[0] ?? node;
  const name = readText(node) ?? readText(run?.text) ?? null;
  if (!name) return null;

  const id = readChannelId(run) ?? readChannelId(node);
  const url = readCanonicalUrl(run) ?? (id ? `https://www.youtube.com/channel/${id}` : null);

  return {
    id,
    name,
    url,
    thumbnails: readThumbnails(thumbnails),
    verified: hasVerifiedBadge(node?.badges ?? node?.ownerBadges),
  };
}

/** Resolve a renderer's navigation endpoint to an absolute youtube.com URL. */
export function readCanonicalUrl(node: any): string | null {
  const path =
    node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ??
    node?.commandMetadata?.webCommandMetadata?.url ??
    null;
  if (typeof path !== 'string') return null;
  return path.startsWith('http') ? path : `https://www.youtube.com${path}`;
}

/** True when any badge marks the channel as verified or an official artist. */
export function hasVerifiedBadge(badges: any): boolean {
  if (!Array.isArray(badges)) return false;
  return badges.some((badge: any) => {
    const style = badge?.metadataBadgeRenderer?.style ?? '';
    return style.includes('VERIFIED') || style.includes('OFFICIAL_ARTIST');
  });
}

/**
 * Depth-first search for every value stored under `key` anywhere in `root`.
 * InnerTube nests renderers unpredictably, so this keeps parsers resilient.
 */
export function findAll(root: any, key: string, limit = Infinity): any[] {
  const found: any[] = [];
  const stack = [root];

  while (stack.length > 0 && found.length < limit) {
    const node = stack.pop();
    if (node == null || typeof node !== 'object') continue;

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }

    for (const [k, value] of Object.entries(node)) {
      if (k === key) {
        found.push(value);
        if (found.length >= limit) break;
      }
      if (value != null && typeof value === 'object') stack.push(value);
    }
  }

  return found;
}

/** First match of `findAll`, or null. */
export function findFirst(root: any, key: string): any {
  return findAll(root, key, 1)[0] ?? null;
}

/** Collect every continuation token reachable from a response fragment. */
export function readContinuation(node: any): string | null {
  const candidates = [
    ...findAll(node, 'continuationCommand', 1).map((c: any) => c?.token),
    ...findAll(node, 'nextContinuationData', 1).map((c: any) => c?.continuation),
    ...findAll(node, 'continuationEndpoint', 1).map((c: any) => c?.continuationCommand?.token),
  ];
  return candidates.find((token) => typeof token === 'string' && token.length > 0) ?? null;
}
