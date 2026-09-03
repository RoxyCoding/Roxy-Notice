export { YouTube } from './client.js';
export type {
  CommentOptions,
  GetVideoOptions,
  ListOptions,
  YouTubeOptions,
} from './client.js';

export {
  InvalidArgumentError,
  MembersOnlyError,
  NetworkError,
  ParseError,
  UnavailableError,
  YouTubeError,
} from './errors.js';

export { HttpClient, type HttpOptions } from './http.js';
export { CLIENTS, InnerTube, extractInitialData } from './clients/innertube.js';

export {
  channelUrl,
  parseChannelInput,
  parsePlaylistId,
  parseVideoId,
  playlistUrl,
  thumbnailUrl,
  videoUrl,
} from './utils.js';

export { formatDuration, parseCount, parseDuration } from './parsers/common.js';

export type * from './types/index.js';

import { YouTube } from './client.js';

/** A ready-to-use client with default options, for quick one-liners. */
export default YouTube;
