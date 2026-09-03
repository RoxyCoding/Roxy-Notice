import { MembersOnlyError, UnavailableError } from '../errors.js';
import type {
  CaptionTrack,
  Chapter,
  StreamBundle,
  StreamFormat,
  VideoDetails,
} from '../types/index.js';
import { channelUrl, videoUrl } from '../utils.js';
import {
  findAll,
  findFirst,
  parseCount,
  parseDuration,
  readText,
  readThumbnails,
} from './common.js';

/** Playability statuses that mean "there is no video to give you". */
const FATAL_STATUSES = new Set(['ERROR', 'LOGIN_REQUIRED', 'UNPLAYABLE', 'AGE_VERIFICATION_REQUIRED']);

/** Throw a descriptive error when the player response says the video is unusable. */
export function assertPlayable(player: any, videoId: string): void {
  const status = player?.playabilityStatus;
  if (!status) {
    throw new UnavailableError(`no playability status for ${videoId}`);
  }
  if (FATAL_STATUSES.has(status.status)) {
    const detail =
      readText(status.reason) ??
      readText(status.errorScreen?.playerErrorMessageRenderer?.reason) ??
      status.status;

    // Members-only videos report the required tier in the reason text; surface
    // that as its own error so callers can tell it apart from a deleted video.
    if (isMembersOnly(status, detail)) {
      throw new MembersOnlyError(`video ${videoId} is members-only: ${detail}`, readTier(detail));
    }

    throw new UnavailableError(`video ${videoId} is unavailable: ${detail}`, status.status);
  }
}

/** Recognise the members-only gate across locales. */
function isMembersOnly(status: any, detail: string): boolean {
  if (status?.errorScreen?.playerErrorMessageRenderer?.subreason != null) {
    const sub = readText(status.errorScreen.playerErrorMessageRenderer.subreason) ?? '';
    if (/member|メンバー/i.test(sub)) return true;
  }
  return /members[- ]only|member of this channel|メンバー(?:限定|が対象|になって)/i.test(detail);
}

/** Pull the tier name out of the reason text, e.g. "Kanon Crew (I)". */
function readTier(detail: string): string | null {
  const match =
    detail.match(/レベル\s*(.+?)\s*以上のメンバー/) ??
    detail.match(/level\s+(.+?)\s+or higher/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * Merge the `player` response (authoritative metadata) with the `next`
 * response (description, likes, chapters) into one `VideoDetails`.
 */
export function parseVideoDetails(player: any, next: any, videoId: string): VideoDetails {
  const details = player?.videoDetails ?? {};
  const micro = player?.microformat?.playerMicroformatRenderer ?? {};

  const durationSeconds = Number.parseInt(details.lengthSeconds ?? micro.lengthSeconds ?? '', 10);
  const isLive = details.isLiveContent === true && details.isLive !== false;

  const primaryInfo = findFirst(next, 'videoPrimaryInfoRenderer');
  const secondaryInfo = findFirst(next, 'videoSecondaryInfoRenderer');

  const description =
    readText(secondaryInfo?.attributedDescription) ??
    readText(secondaryInfo?.description) ??
    details.shortDescription ??
    '';

  const channelId = details.channelId ?? micro.externalChannelId ?? null;

  return {
    type: 'video',
    id: videoId,
    title: details.title ?? readText(primaryInfo?.title) ?? '(untitled)',
    url: videoUrl(videoId),
    thumbnails: readThumbnails(details.thumbnail ?? micro.thumbnail),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    durationText: null,
    viewCount: parseCount(details.viewCount) ?? parseCount(readText(primaryInfo?.viewCount?.videoViewCountRenderer?.viewCount)),
    viewCountText: readText(primaryInfo?.viewCount?.videoViewCountRenderer?.viewCount),
    channel: {
      id: channelId,
      name: details.author ?? micro.ownerChannelName ?? '(unknown)',
      url: channelId ? channelUrl(channelId) : null,
      thumbnails: readThumbnails(findFirst(secondaryInfo, 'videoOwnerRenderer')?.thumbnail),
      verified: (findFirst(secondaryInfo, 'videoOwnerRenderer')?.badges ?? []).some((badge: any) =>
        (badge?.metadataBadgeRenderer?.style ?? '').includes('VERIFIED'),
      ),
    },
    description,
    // The ANDROID player omits the microformat block, so fall back to the
    // date rendered on the watch page.
    publishDate: micro.publishDate ?? parseDateFromNext(next) ?? null,
    uploadDate: micro.uploadDate ?? micro.publishDate ?? null,
    keywords: Array.isArray(details.keywords) ? details.keywords : [],
    category: micro.category ?? null,
    likeCount: parseLikeCount(next),
    liveViewers: parseCount(
      readText(
        findFirst(primaryInfo, 'videoViewCountRenderer')?.viewCount,
      ),
    ) ?? null,
    isFamilySafe: typeof micro.isFamilySafe === 'boolean' ? micro.isFamilySafe : null,
    isPrivate: details.isPrivate === true,
    isUnlisted: micro.isUnlisted === true,
    allowRatings: details.allowRatings !== false,
    availableCaptions: parseCaptionTracks(player),
    chapters: parseChapters(next),
    isLive,
    isUpcoming: details.isUpcoming === true,
  };
}

/** Recover an ISO date from the watch page's metadata rows. */
function parseDateFromNext(next: any): string | null {
  for (const row of findAll(next, 'factoid')) {
    const value = readText(row?.factoidRenderer?.value);
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }

  const dateText =
    readText(findFirst(next, 'dateText')) ??
    readText(findFirst(next, 'relativeDateText'));
  if (!dateText) return null;

  const parsed = Date.parse(dateText.replace(/^(Premiered|Streamed live on|Started streaming on)\s+/i, ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

/**
 * The like count only survives in the accessibility label
 * ("like this video along with 12,345 other people").
 */
function parseLikeCount(next: any): number | null {
  for (const button of findAll(next, 'toggleButtonRenderer')) {
    const label =
      button?.defaultText?.accessibility?.accessibilityData?.label ??
      button?.accessibilityData?.accessibilityData?.label;
    if (typeof label === 'string' && /like/i.test(label)) {
      const count = parseCount(label.replace(/[^\d.,KMB万億千]/g, ' '));
      if (count != null) return count;
    }
  }

  for (const view of findAll(next, 'likeButtonViewModel')) {
    const label = view?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel
      ?.buttonViewModel?.accessibilityText;
    if (typeof label === 'string') {
      const count = parseCount(label);
      if (count != null) return count;
    }
  }

  return null;
}

/** Extract chapter markers from the description-derived macro markers shelf. */
export function parseChapters(next: any): Chapter[] {
  const chapters: Chapter[] = [];

  for (const renderer of findAll(next, 'chapterRenderer')) {
    const start = Number(renderer?.timeRangeStartMillis);
    if (!Number.isFinite(start)) continue;
    chapters.push({
      title: readText(renderer.title) ?? '(untitled chapter)',
      startSeconds: Math.round(start / 1000),
      thumbnails: readThumbnails(renderer.thumbnail),
    });
  }

  return chapters.sort((a, b) => a.startSeconds - b.startSeconds);
}

/** List the caption tracks advertised in the player response. */
export function parseCaptionTracks(player: any): CaptionTrack[] {
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];

  return tracks
    .filter((track: any) => typeof track?.baseUrl === 'string')
    .map((track: any) => ({
      languageCode: track.languageCode ?? '',
      languageName: readText(track.name) ?? track.languageCode ?? '',
      url: track.baseUrl,
      isAutoGenerated: track.kind === 'asr',
      isTranslatable: track.isTranslatable === true,
    }));
}

/** Turn the player's streamingData into a normalised `StreamBundle`. */
export function parseStreams(player: any, videoId: string): StreamBundle {
  const streaming = player?.streamingData ?? {};
  const progressive = (streaming.formats ?? []).map((f: any) => parseFormat(f, false));
  const adaptive = (streaming.adaptiveFormats ?? []).map((f: any) => parseFormat(f, true));

  const expires = Number.parseInt(streaming.expiresInSeconds ?? '', 10);

  return {
    videoId,
    formats: [...progressive, ...adaptive],
    progressive,
    adaptive,
    hlsManifestUrl: streaming.hlsManifestUrl ?? null,
    dashManifestUrl: streaming.dashManifestUrl ?? null,
    expiresInSeconds: Number.isFinite(expires) ? expires : null,
  };
}

function parseFormat(format: any, isAdaptive: boolean): StreamFormat {
  const mimeType: string = format?.mimeType ?? '';
  const codecs = mimeType.match(/codecs="([^"]+)"/)?.[1] ?? '';
  const container = mimeType.split(';')[0] ?? '';

  const hasVideo = container.startsWith('video') && format?.width != null;
  const hasAudio = container.startsWith('audio') || format?.audioQuality != null;

  // Adaptive video tracks report audioQuality on some clients; trust the container.
  const kind: StreamFormat['kind'] = container.startsWith('audio')
    ? 'audio'
    : isAdaptive
      ? 'video'
      : hasVideo && hasAudio
        ? 'video+audio'
        : hasVideo
          ? 'video'
          : 'audio';

  const url: string | null = typeof format?.url === 'string' ? format.url : null;
  const contentLength = Number.parseInt(format?.contentLength ?? '', 10);
  const durationMs = Number.parseInt(format?.approxDurationMs ?? '', 10);
  const sampleRate = Number.parseInt(format?.audioSampleRate ?? '', 10);

  return {
    itag: Number(format?.itag) || 0,
    url,
    mimeType: container,
    kind,
    codecs,
    bitrate: Number(format?.bitrate) || null,
    width: Number(format?.width) || null,
    height: Number(format?.height) || null,
    fps: Number(format?.fps) || null,
    qualityLabel: format?.qualityLabel ?? format?.quality ?? null,
    audioQuality: format?.audioQuality ?? null,
    audioSampleRate: Number.isFinite(sampleRate) ? sampleRate : null,
    audioChannels: Number(format?.audioChannels) || null,
    contentLength: Number.isFinite(contentLength) ? contentLength : null,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    // `signatureCipher` means the URL is obfuscated and needs the player JS.
    requiresCipher: url == null && (format?.signatureCipher != null || format?.cipher != null),
    isAdaptive,
  };
}

/**
 * Parse a timedtext document into transcript segments.
 *
 * YouTube serves two shapes: the current `format="3"` one using
 * `<p t="ms" d="ms">`, and the legacy `<text start="s" dur="s">`.
 */
export function parseTranscriptXml(xml: string): { text: string; startSeconds: number; durationSeconds: number }[] {
  const segments: { text: string; startSeconds: number; durationSeconds: number }[] = [];

  // Current format: timings are integer milliseconds.
  for (const match of xml.matchAll(/<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = cleanCueText(match[3]);
    if (!text) continue;
    segments.push({
      text,
      startSeconds: Number.parseInt(match[1], 10) / 1000,
      durationSeconds: Number.parseInt(match[2] ?? '0', 10) / 1000,
    });
  }
  if (segments.length > 0) return segments;

  // Legacy format: timings are fractional seconds.
  for (const match of xml.matchAll(/<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    const text = cleanCueText(match[3]);
    if (!text) continue;
    segments.push({
      text,
      startSeconds: Number.parseFloat(match[1]) || 0,
      durationSeconds: Number.parseFloat(match[2] ?? '0') || 0,
    });
  }

  return segments;
}

/** Strip inline timing spans, decode entities and collapse line breaks. */
function cleanCueText(raw: string): string {
  return decodeXmlEntities(raw.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** timedtext double-encodes entities, so decode twice. */
function decodeXmlEntities(input: string): string {
  const once = input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

  return once === input ? input : decodeXmlEntities(once);
}
