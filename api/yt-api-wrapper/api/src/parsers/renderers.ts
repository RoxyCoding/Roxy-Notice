import type {
  ChannelCompact,
  PlaylistCompact,
  SearchResult,
  VideoCompact,
} from '../types/index.js';
import { channelUrl, playlistUrl, videoUrl } from '../utils.js';
import {
  findAll,
  hasVerifiedBadge,
  parseCount,
  readChannelRef,
  parseDuration,
  readCanonicalUrl,
  readChannelId,
  readText,
  readTextOr,
  readThumbnails,
} from './common.js';

/** Renderer keys that carry a video in list contexts. */
const VIDEO_RENDERERS = [
  'videoRenderer',
  'compactVideoRenderer',
  'gridVideoRenderer',
  'playlistVideoRenderer',
  'playlistPanelVideoRenderer',
  'reelItemRenderer',
];

/** Turn one search/list item wrapper into a typed result, or null if unknown. */
export function parseListItem(item: any): SearchResult | null {
  if (item == null || typeof item !== 'object') return null;

  for (const key of VIDEO_RENDERERS) {
    if (item[key]) return parseVideoRenderer(item[key]);
  }
  if (item.channelRenderer || item.gridChannelRenderer) {
    return parseChannelRenderer(item.channelRenderer ?? item.gridChannelRenderer);
  }
  if (item.playlistRenderer || item.gridPlaylistRenderer || item.compactPlaylistRenderer) {
    return parsePlaylistRenderer(
      item.playlistRenderer ?? item.gridPlaylistRenderer ?? item.compactPlaylistRenderer,
    );
  }
  // Lockups are the newer generic card shape used on some surfaces.
  if (item.lockupViewModel) return parseLockup(item.lockupViewModel);

  return null;
}

/** Expand shelves/sections and parse every item inside them. */
export function parseListItems(items: any[]): SearchResult[] {
  const results: SearchResult[] = [];

  for (const item of items ?? []) {
    if (item == null) continue;

    const shelfContents =
      item.shelfRenderer?.content?.verticalListRenderer?.items ??
      item.shelfRenderer?.content?.horizontalListRenderer?.items ??
      item.reelShelfRenderer?.items ??
      item.richSectionRenderer?.content?.richShelfRenderer?.contents ??
      null;

    if (Array.isArray(shelfContents)) {
      results.push(...parseListItems(shelfContents));
      continue;
    }

    // Rich grids wrap each card one level deeper.
    if (item.richItemRenderer?.content) {
      const parsed = parseListItem(item.richItemRenderer.content);
      if (parsed) results.push(parsed);
      continue;
    }

    const parsed = parseListItem(item);
    if (parsed) results.push(parsed);
  }

  return results;
}

/** Parse any of the video renderer variants into a `VideoCompact`. */
export function parseVideoRenderer(renderer: any): VideoCompact | null {
  const id = renderer?.videoId;
  if (typeof id !== 'string') return null;

  const badges: string[] = (renderer.badges ?? [])
    .map((badge: any) => badge?.metadataBadgeRenderer?.style ?? '')
    .filter(Boolean);
  const isLive =
    badges.some((style) => style.includes('LIVE')) ||
    renderer.thumbnailOverlays?.some(
      (overlay: any) => overlay?.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE',
    ) === true;
  const isUpcoming = renderer.upcomingEventData != null;

  const durationText =
    readText(renderer.lengthText) ??
    readText(
      renderer.thumbnailOverlays?.find((o: any) => o?.thumbnailOverlayTimeStatusRenderer)
        ?.thumbnailOverlayTimeStatusRenderer?.text,
    );

  const viewCountText =
    readText(renderer.viewCountText) ??
    readText(renderer.shortViewCountText) ??
    readText(renderer.videoInfo);

  const ownerNode =
    renderer.ownerText ??
    renderer.longBylineText ??
    renderer.shortBylineText ??
    renderer.videoOwnerRenderer?.title;

  const channelName = readText(ownerNode);
  const channelId =
    readChannelId(ownerNode?.runs?.[0]) ??
    renderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint
      ?.browseEndpoint?.browseId ??
    null;

  return {
    type: 'video',
    id,
    title: readTextOr(renderer.title, '(untitled)'),
    url: videoUrl(id),
    thumbnails: readThumbnails(renderer.thumbnail),
    durationSeconds: isLive ? null : parseDuration(durationText),
    durationText: durationText ?? null,
    viewCount: parseCount(viewCountText),
    viewCountText: viewCountText ?? null,
    publishedText: readText(renderer.publishedTimeText),
    channel: channelName
      ? {
          id: channelId,
          name: channelName,
          url: channelId ? channelUrl(channelId) : null,
          thumbnails: readThumbnails(
            renderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail ??
              renderer.channelThumbnail,
          ),
          verified: hasVerifiedBadge(renderer.ownerBadges),
        }
      : null,
    description:
      readText(renderer.detailedMetadataSnippets?.[0]?.snippetText) ??
      readText(renderer.descriptionSnippet) ??
      null,
    isLive,
    isUpcoming,
  };
}

/** Parse a `channelRenderer` into a `ChannelCompact`. */
export function parseChannelRenderer(renderer: any): ChannelCompact | null {
  const id = renderer?.channelId;
  if (typeof id !== 'string') return null;

  const subscriberText =
    readText(renderer.subscriberCountText) ?? readText(renderer.videoCountText);
  const handle = readText(renderer.subscriberCountText)?.startsWith('@')
    ? readText(renderer.subscriberCountText)
    : null;

  return {
    type: 'channel',
    id,
    name: readTextOr(renderer.title, '(unnamed)'),
    url: readCanonicalUrl(renderer) ?? channelUrl(id),
    handle,
    thumbnails: readThumbnails(renderer.thumbnail),
    // Newer layouts move the subscriber count into videoCountText and the
    // handle into subscriberCountText, so prefer whichever looks numeric.
    subscriberCount: handle ? parseCount(readText(renderer.videoCountText)) : parseCount(subscriberText),
    subscriberCountText: handle ? readText(renderer.videoCountText) : subscriberText,
    videoCountText: readText(renderer.videoCountText),
    description: readText(renderer.descriptionSnippet),
    verified: hasVerifiedBadge(renderer.ownerBadges),
  };
}

/** Parse any playlist renderer variant into a `PlaylistCompact`. */
export function parsePlaylistRenderer(renderer: any): PlaylistCompact | null {
  const id = renderer?.playlistId;
  if (typeof id !== 'string') return null;

  const countText =
    readText(renderer.videoCountText) ??
    readText(renderer.videoCountShortText) ??
    readText(renderer.thumbnailText);
  const ownerNode = renderer.longBylineText ?? renderer.shortBylineText;
  const channelName = readText(ownerNode);
  const channelId = readChannelId(ownerNode?.runs?.[0]);

  return {
    type: 'playlist',
    id,
    title: readTextOr(renderer.title, '(untitled)'),
    url: playlistUrl(id),
    thumbnails: readThumbnails(
      renderer.thumbnails?.[0] ?? renderer.thumbnail ?? renderer.thumbnailRenderer,
    ),
    videoCount: parseCount(countText),
    channel: channelName
      ? {
          id: channelId,
          name: channelName,
          url: channelId ? channelUrl(channelId) : null,
          thumbnails: [],
          verified: hasVerifiedBadge(renderer.ownerBadges),
        }
      : null,
  };
}

/** Parse the newer generic `lockupViewModel` card into whatever it represents. */
function parseLockup(lockup: any): SearchResult | null {
  const id = lockup?.contentId;
  if (typeof id !== 'string') return null;

  const title = readText(lockup.metadata?.lockupMetadataViewModel?.title) ?? '(untitled)';
  const thumbnails = readThumbnails(
    lockup.contentImage?.thumbnailViewModel?.image ??
      lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image,
  );

  const isPlaylist =
    lockup.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' ||
    lockup.contentType === 'LOCKUP_CONTENT_TYPE_PODCAST';

  if (isPlaylist) {
    // The item count only appears as prose on the thumbnail overlay.
    const overlayText = findAll(lockup.contentImage, 'thumbnailOverlayBadgeViewModel')
      .flatMap((badge: any) => badge?.thumbnailBadges ?? [])
      .map((badge: any) => badge?.thumbnailBadgeViewModel?.text)
      .find((text: any) => typeof text === 'string' && /\d/.test(text));

    return {
      type: 'playlist',
      id,
      title,
      url: playlistUrl(id),
      thumbnails,
      videoCount: parseCount(overlayText ?? null),
      channel: readChannelRef(lockup.metadata?.lockupMetadataViewModel?.metadata),
    };
  }

  const metadataRows =
    lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  const metadataTexts = (Array.isArray(metadataRows) ? metadataRows : [])
    .flatMap((row: any) => (Array.isArray(row?.metadataParts) ? row.metadataParts : []))
    .map((part: any) => readText(part?.text) ?? readText(part))
    .filter((text: string | null): text is string => Boolean(text));

  const badgeModels = [
    ...findAll(lockup.contentImage, 'thumbnailBadgeViewModel'),
    ...findAll(lockup.contentImage, 'thumbnailOverlayTimeStatusRenderer'),
  ];
  const badgeTexts = badgeModels
    .map((badge: any) => readText(badge?.text) ?? readText(badge?.label))
    .filter((text: string | null): text is string => Boolean(text));
  const badgeStyles = badgeModels
    .flatMap((badge: any) => [badge?.badgeStyle, badge?.style])
    .filter((style: unknown): style is string => typeof style === 'string');
  const accessibilityTexts = findAll(lockup, 'accessibilityLabel')
    .filter((label: unknown): label is string => typeof label === 'string');
  const statusText = [...metadataTexts, ...badgeTexts, ...accessibilityTexts].join(' ');

  const durationText = badgeTexts.find((text) => /^\d{1,3}:\d{2}(?::\d{2})?$/.test(text.trim())) ?? null;
  const archived = /配信済み|公開済み|streamed|premiered|\bago\b|\d+\s*(?:秒|分|時間|日|週間|か月|ヶ月|年)前/i.test(statusText);
  const liveSignal = /ライブ配信中|配信中|\bLIVE\b|watching now/i.test(statusText) ||
    badgeStyles.some((style) => /LIVE/i.test(style));
  const upcomingSignal = /公開予定|配信予定|開始予定|待機中|プレミア公開|scheduled|upcoming|premieres?\s+(?:in|on|at)/i.test(statusText);
  // Scheduled lockups often contain only a future date/time and no duration.
  const futureDateSignal = !durationText && /(?:\d{1,2}月\d{1,2}日|\d{4}[/-]\d{1,2}[/-]\d{1,2}|午前|午後|\d{1,2}[:：]\d{2})/.test(statusText);
  const isLive = !archived && liveSignal;
  const isUpcoming = !isLive && !archived && (upcomingSignal || futureDateSignal);
  const viewCountText = metadataTexts.find((text) => /回視聴|視聴中|人が待機|views?|watching|waiting/i.test(text)) ?? null;
  const publishedText = metadataTexts.find((text) => text !== viewCountText) ?? null;

  return {
    type: 'video',
    id,
    title,
    url: videoUrl(id),
    thumbnails,
    durationSeconds: isLive || isUpcoming ? null : parseDuration(durationText),
    durationText,
    viewCount: parseCount(viewCountText),
    viewCountText,
    publishedText,
    channel: null,
    description: null,
    isLive,
    isUpcoming,
  };
}
