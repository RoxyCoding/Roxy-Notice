export interface TweetViewerClientOptions {
  baseUrl?: string | URL;
  /** Live timeline provider used by getTimeline/getLiveTimeline/getLatestTweet. */
  liveBaseUrl?: string | URL;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface Profile {
  handle: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  followers?: number;
  following?: number;
  posts?: number;
  joined?: string;
  location?: string;
  website?: string;
  verified?: boolean;
  isBlueVerified?: boolean;
  profileUrl: string;
}

export interface MediaVideo {
  mp4: string;
  poster?: string;
  duration_ms?: number;
}

export interface Media {
  type: "photo" | "video" | "animated_gif" | string;
  url: string;
  thumb?: string;
  width?: number;
  height?: number;
  video?: MediaVideo;
}

export interface Tweet {
  id: string;
  createdAt: string;
  text: string;
  html?: string;
  permalink: string;
  replies?: number;
  retweets?: number;
  likes?: number;
  views?: number;
  quotes?: number;
  bookmarks?: number;
  media: Media[];
  isRetweet?: boolean;
  retweetedBy?: string;
  retweetedByName?: string;
  isReply?: boolean;
  isSelfReply?: boolean;
  sensitive?: boolean;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  authorVerified?: boolean;
}

export interface TimelineResponse {
  ok: true;
  source?: string;
  profile?: Profile;
  tweets: Tweet[];
  cursor?: string | null;
}

export interface ProfileViewResponse extends Profile {
  ok: true;
  kind: "profile";
  timelineNote?: string;
}

export interface TweetViewResponse {
  ok: true;
  kind: "tweet";
  sourceUrl: string;
  html: string;
  author_name?: string;
  author_url?: string;
}

export interface TweetResponse {
  ok: true;
  tweet: Tweet;
  profile: Pick<Profile, "handle" | "displayName"> & Partial<Profile>;
}

export interface MediaVariant {
  quality: string;
  resolution: string;
  url: string;
  bitrate?: number;
  photo?: boolean;
}

export interface ResolveMediaResponse {
  ok: true;
  kind: "video" | "photo" | "text";
  author?: string;
  authorName?: string;
  authorAvatar?: string | null;
  verified?: boolean;
  verifiedType?: "blue" | "business" | "government";
  text?: string;
  createdAt?: string;
  views?: number;
  likes?: number;
  retweets?: number;
  videoDuration?: number;
  mediaWidth?: number;
  mediaHeight?: number;
  thumbnail?: string | null;
  variants: MediaVariant[];
}

export class TweetViewerError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

export class TweetViewerClient {
  constructor(options?: TweetViewerClientOptions);
  readonly baseUrl: URL;
  readonly liveBaseUrl: URL;
  readonly timeoutMs: number;
  view(query: string, options?: RequestOptions): Promise<ProfileViewResponse | TweetViewResponse>;
  getProfile(handle: string, options?: RequestOptions): Promise<ProfileViewResponse>;
  getTimeline(handle: string, options?: RequestOptions & { cursor?: string }): Promise<TimelineResponse>;
  getLiveTimeline(handle: string, options?: RequestOptions & { cursor?: string }): Promise<TimelineResponse>;
  getLatestTweet(handle: string, options?: RequestOptions & { includeReplies?: boolean; includeRetweets?: boolean }): Promise<Tweet>;
  iterateTimeline(handle: string, options?: RequestOptions & { cursor?: string; maxPages?: number }): AsyncGenerator<TimelineResponse>;
  getTweet(idOrUrl: string | number | bigint, options?: RequestOptions): Promise<TweetResponse>;
  resolveMedia(idOrUrl: string | number | bigint, options?: RequestOptions & { language?: string }): Promise<ResolveMediaResponse>;
  fetchMedia(mediaUrl: string | URL, options?: RequestOptions & { range?: string }): Promise<Response>;
}

export function normalizeHandle(input: string): string;
export function normalizeTweetId(input: string | number | bigint): string;
export const tweetViewer: TweetViewerClient;

export interface ServerOptions {
  client?: TweetViewerClient;
  corsOrigin?: string | false;
}

export function createTweetViewerServer(options?: ServerOptions): import("node:http").Server;
