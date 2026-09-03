import { HttpClient, type HttpOptions } from './http.js';
import { InnerTube, extractInitialData, type CLIENTS } from './clients/innertube.js';
import { InvalidArgumentError, ParseError, UnavailableError } from './errors.js';
import { parseComments } from './parsers/comments.js';
import { parseCommunityPosts, parseLiveChatMessages } from './parsers/community.js';
import { findAll, findFirst, parseCount, readContinuation, readText, readThumbnails } from './parsers/common.js';
import { encodeSearchFilters } from './parsers/filters.js';
import { parseListItems, parseVideoRenderer } from './parsers/renderers.js';
import {
  assertPlayable,
  parseCaptionTracks,
  parseStreams,
  parseTranscriptXml,
  parseVideoDetails,
} from './parsers/video.js';
import type {
  CaptionTrack,
  ChannelDetails,
  CommunityPost,
  LiveChatMessage,
  Comment,
  Page,
  PlaylistCompact,
  PlaylistDetails,
  SearchOptions,
  SearchResult,
  StreamBundle,
  TranscriptSegment,
  VideoCompact,
  VideoDetails,
} from './types/index.js';
import { channelUrl, parseChannelInput, parsePlaylistId, parseVideoId, playlistUrl } from './utils.js';

export interface YouTubeOptions extends HttpOptions {
  /** ISO country code, e.g. "JP". Default "US". */
  region?: string;
  /** UI language, e.g. "ja". Default "en". */
  language?: string;
  /** IANA time zone used for localized dates. */
  timeZone?: string;
  /** Current offset from UTC in minutes. */
  utcOffsetMinutes?: number;
  /** Cookie header for authenticated requests (advanced, optional). */
  cookie?: string;
}

/** Options for `getVideo`. */
export interface GetVideoOptions {
  /** Also resolve playable stream URLs (one extra request). Default false. */
  withStreams?: boolean;
}

/** Options for the paginated list methods. */
export interface ListOptions {
  /** Approximate maximum number of items to collect. Default 50. */
  limit?: number;
}

/** Options for `getComments`. */
export interface CommentOptions extends ListOptions {
  sortBy?: 'top' | 'newest';
}

/**
 * Unofficial YouTube client.
 *
 * Every method works without an API key by talking to InnerTube, the private
 * JSON API that youtube.com and the mobile apps use.
 *
 * ```ts
 * const yt = new YouTube({ region: 'JP', language: 'ja' });
 * const video = await yt.getVideo('dQw4w9WgXcQ');
 * ```
 */
export class YouTube {
  private readonly http: HttpClient;
  private readonly innertube: InnerTube;

  constructor(options: YouTubeOptions = {}) {
    const { region, language, timeZone, utcOffsetMinutes, cookie, ...httpOptions } = options;
    this.http = new HttpClient(httpOptions);
    this.innertube = new InnerTube({ http: this.http, region, language, timeZone, utcOffsetMinutes, cookie });
  }

  // ---------------------------------------------------------------- videos

  /** Fetch full metadata for a video by id or URL. */
  async getVideo(input: string, options: GetVideoOptions = {}): Promise<VideoDetails> {
    const videoId = parseVideoId(input);

    const [player, next] = await Promise.all([
      this.fetchPlayer(videoId),
      this.innertube.call('next', { videoId }).catch(() => null),
    ]);

    assertPlayable(player, videoId);
    const details = parseVideoDetails(player, next, videoId);

    if (options.withStreams) {
      details.streams = (await this.getStreams(videoId)).formats;
    }
    return details;
  }

  /**
   * Call `player`, trying each client until one is allowed to play the video.
   *
   * YouTube now refuses the WEB client for anonymous callers (it answers
   * UNPLAYABLE), so ANDROID leads; it is also the only client that returns
   * stream URLs that are not cipher-protected.
   */
  private async fetchPlayer(videoId: string): Promise<any> {
    const payload = { videoId, contentCheckOk: true, racyCheckOk: true };
    let lastPlayer: any = null;

    for (const client of PLAYER_CLIENTS) {
      const player = await this.innertube
        .withClient(client)
        .call('player', payload)
        .catch(() => null);

      if (!player) continue;
      lastPlayer = player;

      const status = player?.playabilityStatus?.status;
      if (status === 'OK' || status === 'LIVE_STREAM_OFFLINE') return player;
    }

    if (lastPlayer) return lastPlayer;
    throw new UnavailableError(`no client could load video ${videoId}`);
  }

  /**
   * Resolve playable / downloadable stream URLs.
   *
   * Prefers whichever client actually returns usable formats; ANDROID gives
   * plain URLs while the web client's are cipher-protected.
   */
  async getStreams(input: string): Promise<StreamBundle> {
    const videoId = parseVideoId(input);
    const player = await this.fetchPlayer(videoId);
    assertPlayable(player, videoId);

    const bundle = parseStreams(player, videoId);
    if (bundle.formats.length === 0 && !bundle.hlsManifestUrl && !bundle.dashManifestUrl) {
      throw new UnavailableError(`no playable streams found for ${videoId}`);
    }
    return bundle;
  }

  /** Videos YouTube suggests alongside a given video. */
  async getRelated(input: string, options: ListOptions = {}): Promise<VideoCompact[]> {
    const videoId = parseVideoId(input);
    const limit = options.limit ?? 20;

    let response = await this.innertube.call('next', { videoId });
    let container =
      findFirst(response, 'secondaryResults')?.secondaryResults ??
      findFirst(response, 'secondaryResults') ??
      response;

    const results: VideoCompact[] = [];
    let items: any[] = container?.results ?? [];
    let continuation = readContinuation(items);

    while (results.length < limit) {
      for (const item of parseListItems(items)) {
        if (item.type === 'video') results.push(item);
      }
      if (results.length >= limit || !continuation) break;

      response = await this.innertube.continue('next', continuation);
      items = findAll(response, 'continuationItems').flat();
      continuation = readContinuation(items);
      if (items.length === 0) break;
    }

    return results.slice(0, limit);
  }

  // ---------------------------------------------------------------- search

  /** Search YouTube. Returns videos, channels and playlists unless filtered. */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!query.trim()) throw new InvalidArgumentError('search query must not be empty');
    const limit = options.limit ?? 20;

    const params = encodeSearchFilters(options);
    let response = await this.innertube.call('search', {
      query,
      ...(params ? { params } : {}),
    });

    const results: SearchResult[] = [];
    let items = collectSearchItems(response);
    let continuation = readContinuation(response);

    while (results.length < limit) {
      results.push(...parseListItems(items));
      if (results.length >= limit || !continuation) break;

      response = await this.innertube.continue('search', continuation);
      items = findAll(response, 'continuationItems').flat();
      continuation = readContinuation(response);
      if (items.length === 0) break;
    }

    return results.slice(0, limit);
  }

  /** Search restricted to videos, typed as such. */
  async searchVideos(query: string, options: Omit<SearchOptions, 'type'> = {}): Promise<VideoCompact[]> {
    const results = await this.search(query, { ...options, type: 'video' });
    return results.filter((item): item is VideoCompact => item.type === 'video');
  }

  /** YouTube's autocomplete suggestions for a partial query. */
  async getSuggestions(query: string): Promise<string[]> {
    const url =
      'https://suggestqueries-clients6.youtube.com/complete/search' +
      `?client=youtube&ds=yt&oe=utf-8&q=${encodeURIComponent(query)}` +
      `&hl=${this.innertube.language}&gl=${this.innertube.region}`;

    const body = await this.http.text(url);
    // The response is JSONP: `window.google.ac.h([...])`.
    const json = body.slice(body.indexOf('(') + 1, body.lastIndexOf(')'));

    try {
      const parsed = JSON.parse(json);
      return (parsed?.[1] ?? []).map((entry: any) => entry?.[0]).filter((s: any) => typeof s === 'string');
    } catch (error) {
      throw new ParseError('failed to parse suggestion response', error);
    }
  }

  // --------------------------------------------------------------- channel

  /** Fetch channel metadata by id, @handle, vanity name or URL. */
  async getChannel(input: string): Promise<ChannelDetails> {
    const channelId = await this.resolveChannelId(input);
    const response = await this.innertube.call('browse', { browseId: channelId });

    // The join button is the only anonymous-visible signal that the channel
    // runs a membership programme.
    const hasMemberships = JSON.stringify(response).includes('sponsorships-button');

    const metadata = response?.metadata?.channelMetadataRenderer ?? {};
    const header =
      findFirst(response, 'c4TabbedHeaderRenderer') ??
      findFirst(response, 'pageHeaderRenderer') ??
      {};
    const micro = response?.microformat?.microformatDataRenderer ?? {};

    const subscriberText =
      readText(header.subscriberCountText) ??
      readText(findFirst(header, 'contentMetadataViewModel')?.metadataRows?.[1]?.metadataParts?.[0]?.text);

    return {
      type: 'channel',
      id: metadata.externalId ?? channelId,
      name: metadata.title ?? readText(header.title) ?? '(unnamed)',
      url: metadata.channelUrl ?? channelUrl(channelId),
      handle: metadata.vanityChannelUrl?.match(/@[\w.-]+/)?.[0] ?? null,
      thumbnails: readThumbnails(metadata.avatar ?? header.avatar),
      banners: readThumbnails(header.banner),
      subscriberCount: parseCount(subscriberText),
      subscriberCountText: subscriberText,
      videoCountText: readText(header.videosCountText),
      description: metadata.description ?? micro.description ?? null,
      keywords: typeof metadata.keywords === 'string' ? metadata.keywords.split(/\s+/).filter(Boolean) : [],
      links: findAll(response, 'channelHeaderLinksViewModel')
        .flatMap((links: any) => [...(links?.firstLink ? [links.firstLink] : []), ...(links?.more ? [links.more] : [])])
        .map((link: any) => ({ title: readText(link) ?? '', url: link?.commandRuns?.[0]?.onTap?.innertubeCommand?.urlEndpoint?.url ?? '' }))
        .filter((link) => link.url),
      country: readText(findFirst(response, 'country')) ?? null,
      joinedDate: readText(findAll(response, 'joinedDateText')[0]) ?? null,
      viewCount: parseCount(readText(findAll(response, 'viewCountText')[0])),
      isFamilySafe: typeof micro.familySafe === 'boolean' ? micro.familySafe : null,
      hasMemberships,
      tabs: (response?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [])
        .map((tab: any) => tab?.tabRenderer?.title)
        .filter((title: any) => typeof title === 'string'),
      verified: (header.badges ?? []).some((badge: any) =>
        (badge?.metadataBadgeRenderer?.style ?? '').includes('VERIFIED'),
      ),
    };
  }

  /** Uploads from a channel, newest first. */
  async getChannelVideos(input: string, options: ListOptions = {}): Promise<VideoCompact[]> {
    return this.browseChannelTab(input, 'videos', options);
  }

  /** Shorts posted by a channel. */
  async getChannelShorts(input: string, options: ListOptions = {}): Promise<VideoCompact[]> {
    return this.browseChannelTab(input, 'shorts', options);
  }

  /** Live streams (past and current) from a channel. */
  async getChannelStreams(input: string, options: ListOptions = {}): Promise<VideoCompact[]> {
    return this.browseChannelTab(input, 'streams', options);
  }

  /** Resolve any channel reference to a UC… id. */
  async resolveChannelId(input: string): Promise<string> {
    const parsed = parseChannelInput(input);
    if (parsed.kind === 'id') return parsed.value;

    const path = parsed.kind === 'handle' ? `/@${parsed.value}` : `/c/${parsed.value}`;
    const response = await this.innertube.call('navigation/resolve_url', {
      url: `https://www.youtube.com${path}`,
    });

    const browseId =
      response?.endpoint?.browseEndpoint?.browseId ??
      response?.endpoint?.commandMetadata?.webCommandMetadata?.url?.match(/\/channel\/(UC[\w-]+)/)?.[1];

    if (typeof browseId === 'string' && browseId.startsWith('UC')) return browseId;

    // `resolve_url` often answers a vanity redirect (`/hikakintv`) with no
    // browseId at all, so scrape whichever page it points at.
    const redirect: string | undefined =
      response?.endpoint?.urlEndpoint?.url ??
      response?.endpoint?.commandMetadata?.webCommandMetadata?.url;
    const target =
      typeof redirect === 'string' && redirect.includes('youtube.com') ? redirect : path;

    const html = await this.innertube.page(target);

    // Only `externalId` and the canonical link identify the page's OWN channel.
    // `channelId` appears throughout the markup for related channels, featured
    // videos and sidebar entries, so matching it picks up the wrong channel.
    const scraped =
      html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
      html.match(/<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1];

    if (scraped) return scraped;

    throw new UnavailableError(`could not resolve channel: ${input}`);
  }

  /** Channel playlists tab. */
  async getChannelPlaylists(input: string, options: ListOptions = {}): Promise<PlaylistCompact[]> {
    const channelId = await this.resolveChannelId(input);
    const limit = options.limit ?? 50;

    let response = await this.innertube.call('browse', {
      browseId: channelId,
      params: channelTabParams('playlists'),
    });
    let items = collectTabItems(response);
    let continuation = readContinuation(response);

    const playlists: PlaylistCompact[] = [];
    while (playlists.length < limit) {
      for (const item of parseListItems(items)) {
        if (item.type === 'playlist') playlists.push(item);
      }
      if (playlists.length >= limit || !continuation) break;

      response = await this.innertube.continue('browse', continuation);
      items = findAll(response, 'continuationItems').flat();
      continuation = readContinuation(response);
      if (items.length === 0) break;
    }

    return playlists.slice(0, limit);
  }

  /** Community (posts) tab. */
  async getCommunityPosts(input: string, options: ListOptions = {}): Promise<CommunityPost[]> {
    const channelId = await this.resolveChannelId(input);
    const limit = options.limit ?? 30;

    let response = await this.innertube.call('browse', {
      browseId: channelId,
      params: channelTabParams('community'),
    });

    const posts: CommunityPost[] = [];
    let continuation = readContinuation(response);

    while (posts.length < limit) {
      posts.push(...parseCommunityPosts(response));
      if (posts.length >= limit || !continuation) break;

      const nextPage = await this.innertube.continue('browse', continuation);
      if (parseCommunityPosts(nextPage).length === 0) break;
      response = nextPage;
      continuation = readContinuation(response);
    }

    return posts.slice(0, limit);
  }

  // ------------------------------------------------------------- live chat

  /**
   * Read a batch of messages from a live stream's chat.
   *
   * Pass the returned `continuation` back in to read the next batch; that is
   * how the chat is polled. The first call is a bootstrap and usually comes
   * back empty — messages start arriving from the second call onward, so poll
   * a few times rather than concluding the chat is dead.
   *
   * Works on a running stream and on the replay of a finished one.
   */
  async getLiveChat(input: string, continuation?: string): Promise<Page<LiveChatMessage>> {
    const videoId = parseVideoId(input);

    if (continuation) {
      return this.readLiveChatPage(continuation);
    }

    // The token embedded in the `next` response is a placeholder that the
    // live-chat endpoint rejects, so read the chat iframe instead. It carries
    // several tokens (top chat / live chat / replay); only one of them yields
    // messages, and which one varies, so try each and keep the first that works.
    const html = await this.innertube
      .page(`/live_chat?is_popout=1&v=${videoId}`)
      .catch(() => null);

    const tokens = [...(html?.matchAll(/"continuation":"([^"]{30,})"/g) ?? [])].map((m) => m[1]);
    if (tokens.length === 0) {
      // Either the video never had a chat, or it is a finished stream whose
      // replay the uploader disabled — YouTube does not distinguish the two.
      throw new UnavailableError(
        `video ${videoId} has no live chat (not a stream, or its replay is unavailable)`,
      );
    }

    // Try them all and keep whichever yields the most messages. Picking the
    // first that merely succeeds is not enough: the top-chat token answers OK
    // with an empty batch even when the full chat has hundreds of messages.
    let best: Page<LiveChatMessage> | null = null;
    for (const token of new Set(tokens)) {
      const page = await this.readLiveChatPage(token).catch(() => null);
      if (!page) continue;
      if (best === null || page.items.length > best.items.length) best = page;
    }

    // An empty result is still valid: a running chat with no recent messages
    // hands back the continuation that carries the stream forward.
    if (best) return best;
    throw new UnavailableError(`video ${videoId} has no readable live chat`);
  }

  /** Fetch one page of chat, trying the replay endpoint before the live one. */
  private async readLiveChatPage(continuation: string): Promise<Page<LiveChatMessage>> {
    let response: any = null;

    for (const endpoint of ['live_chat/get_live_chat_replay', 'live_chat/get_live_chat']) {
      response = await this.innertube.call(endpoint, { continuation }).catch(() => null);
      if (response) break;
    }
    if (!response) throw new UnavailableError('live chat continuation was rejected');

    const live = response?.continuationContents?.liveChatContinuation ?? {};

    return {
      items: parseLiveChatMessages(response),
      continuation:
        findAll(live, 'liveChatReplayContinuationData')[0]?.continuation ??
        findAll(live, 'invalidationContinuationData')[0]?.continuation ??
        findAll(live, 'timedContinuationData')[0]?.continuation ??
        findAll(live, 'reloadContinuationData')[0]?.continuation ??
        null,
    };
  }

  private async browseChannelTab(
    input: string,
    tab: 'videos' | 'shorts' | 'streams',
    options: ListOptions,
  ): Promise<VideoCompact[]> {
    const channelId = await this.resolveChannelId(input);
    const limit = options.limit ?? 50;

    let response = await this.innertube.call('browse', {
      browseId: channelId,
      params: channelTabParams(tab),
    });
    let items = collectTabItems(response);
    let continuation = readContinuation(response);

    const videos: VideoCompact[] = [];
    while (videos.length < limit) {
      for (const item of parseListItems(items)) {
        if (item.type === 'video') videos.push(item);
      }
      if (videos.length >= limit || !continuation) break;

      response = await this.innertube.continue('browse', continuation);
      items = findAll(response, 'continuationItems').flat();
      continuation = readContinuation(response);
      if (items.length === 0) break;
    }

    return videos.slice(0, limit);
  }

  // -------------------------------------------------------------- playlist

  /** Fetch a playlist and its videos. */
  async getPlaylist(input: string, options: ListOptions = {}): Promise<PlaylistDetails> {
    const playlistId = parsePlaylistId(input);
    const limit = options.limit ?? 100;

    let response = await this.innertube.call('browse', { browseId: `VL${playlistId}` });

    const header =
      findFirst(response, 'playlistHeaderRenderer') ??
      findFirst(response, 'pageHeaderRenderer') ??
      {};
    const sidebar = findFirst(response, 'playlistSidebarPrimaryInfoRenderer') ?? {};

    let items = collectTabItems(response);
    let continuation = readContinuation(response);
    const videos: VideoCompact[] = [];

    while (videos.length < limit) {
      for (const item of parseListItems(items)) {
        if (item.type === 'video') videos.push(item);
      }
      if (videos.length >= limit || !continuation) break;

      response = await this.innertube.continue('browse', continuation);
      items = findAll(response, 'continuationItems').flat();
      continuation = readContinuation(response);
      if (items.length === 0) break;
    }

    const title = readText(header.title) ?? readText(sidebar.title) ?? '(untitled)';
    const countText = readText(header.numVideosText) ?? readText(sidebar.stats?.[0]);
    const ownerRenderer = findFirst(response, 'videoOwnerRenderer');
    const ownerId = ownerRenderer?.navigationEndpoint?.browseEndpoint?.browseId ?? null;
    const ownerName = readText(header.ownerText) ?? readText(ownerRenderer?.title);

    return {
      type: 'playlist',
      id: playlistId,
      title,
      url: playlistUrl(playlistId),
      thumbnails: readThumbnails(header.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail)
        .concat(videos[0]?.thumbnails ?? [])
        .slice(0, 4),
      videoCount: parseCount(countText) ?? videos.length,
      channel: ownerName
        ? { id: ownerId, name: ownerName, url: ownerId ? channelUrl(ownerId) : null, thumbnails: [], verified: false }
        : null,
      description: readText(header.descriptionText) ?? readText(sidebar.description) ?? null,
      viewCount: parseCount(readText(header.viewCountText) ?? readText(sidebar.stats?.[1])),
      lastUpdatedText: readText(sidebar.stats?.[2]),
      videos: videos.slice(0, limit),
    };
  }

  // -------------------------------------------------------------- comments

  /** Fetch top-level comments for a video. */
  async getComments(input: string, options: CommentOptions = {}): Promise<Comment[]> {
    const videoId = parseVideoId(input);
    const limit = options.limit ?? 50;

    const next = await this.innertube.call('next', { videoId });
    // The comments section is a lazily-loaded continuation on the watch page.
    const section = findAll(next, 'itemSectionRenderer').find(
      (s: any) => s?.sectionIdentifier === 'comment-item-section',
    );
    let continuation = section ? readContinuation(section) : null;
    if (!continuation) return [];

    let response = await this.innertube.continue('next', continuation);

    if (options.sortBy === 'newest') {
      const sortToken = findAll(response, 'sortFilterSubMenuRenderer')[0]
        ?.subMenuItems?.[1]?.serviceEndpoint?.continuationCommand?.token;
      if (sortToken) response = await this.innertube.continue('next', sortToken);
    }

    const comments: Comment[] = [];
    while (comments.length < limit) {
      comments.push(...parseComments(response));
      continuation = readContinuation(findAll(response, 'continuationItemRenderer').at(-1));
      if (comments.length >= limit || !continuation) break;

      const nextPage = await this.innertube.continue('next', continuation);
      if (parseComments(nextPage).length === 0) break;
      response = nextPage;
    }

    return comments.slice(0, limit);
  }

  /** Fetch replies to a comment using its `repliesToken`. */
  async getCommentReplies(token: string, options: ListOptions = {}): Promise<Comment[]> {
    if (!token) throw new InvalidArgumentError('a repliesToken is required');
    const limit = options.limit ?? 50;

    const replies: Comment[] = [];
    let continuation: string | null = token;

    while (continuation && replies.length < limit) {
      const response: any = await this.innertube.continue('next', continuation);
      const page = parseComments(response);
      if (page.length === 0) break;
      replies.push(...page);
      continuation = readContinuation(findAll(response, 'continuationItemRenderer').at(-1));
    }

    return replies.slice(0, limit);
  }

  // -------------------------------------------------------------- captions

  /** List the caption tracks available for a video. */
  async getCaptions(input: string): Promise<CaptionTrack[]> {
    const videoId = parseVideoId(input);
    const player = await this.fetchPlayer(videoId);
    assertPlayable(player, videoId);
    return parseCaptionTracks(player);
  }

  /**
   * Fetch a transcript. Picks `language` when available, otherwise the first
   * manual track, otherwise the first auto-generated one.
   */
  async getTranscript(input: string, language?: string): Promise<TranscriptSegment[]> {
    const tracks = await this.getCaptions(input);
    if (tracks.length === 0) {
      throw new UnavailableError(`no captions available for ${parseVideoId(input)}`);
    }

    const track =
      (language && tracks.find((t) => t.languageCode === language)) ||
      tracks.find((t) => !t.isAutoGenerated) ||
      tracks[0];

    // The timedtext endpoint intermittently accepts the connection and then
    // stalls instead of answering. A short per-attempt timeout lets the retry
    // loop step over a stalled connection rather than waiting out the full
    // budget on it.
    const xml = await this.http.text(track.url, {
      headers: { 'User-Agent': this.innertube.client.userAgent },
      timeout: 5_000,
      retries: 5,
    });
    const segments = parseTranscriptXml(xml);

    if (segments.length === 0) {
      throw new ParseError(`transcript for ${track.languageCode} came back empty`);
    }
    return segments;
  }

  // -------------------------------------------------------------- trending

  /**
   * Most-popular videos for a category.
   *
   * YouTube retired the browsable `/feed/trending` surface, so this reads the
   * auto-curated charts playlists that replaced it. `now` uses the region's
   * "most popular" chart when one exists and falls back to the global one.
   */
  async getTrending(
    category: 'now' | 'music' | 'gaming' | 'movies' = 'now',
    options: ListOptions = {},
  ): Promise<VideoCompact[]> {
    const limit = options.limit ?? 50;

    // Charts playlists are region-suffixed: PLxx<CC> for most-popular.
    const region = this.innertube.region.toUpperCase();
    const candidates: Record<typeof category, string[]> = {
      now: [`PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-`, `PLFgquLnL59alW3xmYiWRaoz0oM3H17Lth`],
      music: ['PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'],
      gaming: ['PLFgquLnL59alF0GjxEs0V_XvpZWpAv1VP'],
      movies: ['PLFgquLnL59amjZuAjZfHKlkNSTQVdPvOo'],
    };

    let lastError: unknown;
    for (const playlistId of candidates[category]) {
      try {
        const playlist = await this.getPlaylist(playlistId, { limit });
        if (playlist.videos.length > 0) return playlist.videos.slice(0, limit);
      } catch (error) {
        lastError = error;
      }
    }

    throw new UnavailableError(
      `no trending chart available for ${category} in region ${region}` +
        (lastError instanceof Error ? `: ${lastError.message}` : ''),
    );
  }

  // ------------------------------------------------------------------ misc

  /** Resolve oEmbed metadata — the cheapest way to check a video exists. */
  async getOEmbed(input: string): Promise<{
    title: string;
    authorName: string;
    authorUrl: string;
    thumbnailUrl: string;
    width: number;
    height: number;
  }> {
    const videoId = parseVideoId(input);
    const url = `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`;
    const data = await this.http.json<any>(url);

    return {
      title: data.title ?? '',
      authorName: data.author_name ?? '',
      authorUrl: data.author_url ?? '',
      thumbnailUrl: data.thumbnail_url ?? '',
      width: Number(data.width) || 0,
      height: Number(data.height) || 0,
    };
  }

  /**
   * Scrape a youtube.com page and return its `ytInitialData` blob.
   * An escape hatch for data this library does not model yet.
   */
  async getRawPageData(path: string, variable = 'ytInitialData'): Promise<any> {
    const html = await this.innertube.page(path);
    return extractInitialData(html, variable);
  }

  /** Call any InnerTube endpoint directly. Escape hatch for advanced use. */
  async raw<T = any>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    return this.innertube.call<T>(endpoint, payload);
  }
}

/**
 * Base64 protobuf selecting a channel tab.
 *
 * These are the exact `params` values youtube.com sends. A hand-rolled
 * `{2: "<tab>"}` message is silently ignored and YouTube serves the Home tab
 * instead, so the constants matter.
 */
const CHANNEL_TAB_PARAMS = {
  videos: 'EgZ2aWRlb3PyBgQKAjoA',
  shorts: 'EgZzaG9ydHPyBgUKA5oBAA==',
  streams: 'EgdzdHJlYW1z8gYECgJ6AA==',
  playlists: 'EglwbGF5bGlzdHPyBgQKAkIA',
  community: 'Egljb21tdW5pdHnyBgQKAkoA',
} as const;

function channelTabParams(tab: keyof typeof CHANNEL_TAB_PARAMS): string {
  return CHANNEL_TAB_PARAMS[tab];
}

/** Client identities tried for `player`, in order of usefulness. */
const PLAYER_CLIENTS: (keyof typeof CLIENTS)[] = [
  'VISIONOS',
  'ANDROID',
  'IOS',
  'TV_EMBEDDED',
  'WEB',
];

/** Pull the item list out of a search response, whatever shape it arrived in. */
function collectSearchItems(response: any): any[] {
  const sections =
    response?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ??
    findAll(response, 'sectionListRenderer')[0]?.contents ??
    [];

  return sections.flatMap((section: any) => section?.itemSectionRenderer?.contents ?? []);
}

/** Pull the item list out of a browse (channel/playlist) response. */
function collectTabItems(response: any): any[] {
  const tabs = response?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const selected = tabs.find((tab: any) => tab?.tabRenderer?.selected) ?? tabs[0];
  const content = selected?.tabRenderer?.content;

  const direct =
    content?.richGridRenderer?.contents ??
    content?.sectionListRenderer?.contents?.flatMap(
      (section: any) =>
        section?.itemSectionRenderer?.contents?.flatMap(
          (inner: any) =>
            inner?.playlistVideoListRenderer?.contents ??
            inner?.gridRenderer?.items ??
            inner?.shelfRenderer?.content?.expandedShelfContentsRenderer?.items ??
            [inner],
        ) ?? [],
    );

  if (Array.isArray(direct) && direct.length > 0) return direct;

  // Last resort: sweep the whole response for anything that looks like a list.
  return [
    ...findAll(response, 'contents').flat(),
    ...findAll(response, 'items').flat(),
  ].filter((item: any) => item && typeof item === 'object');
}
