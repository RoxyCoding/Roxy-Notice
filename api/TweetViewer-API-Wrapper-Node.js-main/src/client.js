const DEFAULT_BASE_URL = "https://tweetviewer.com";
const DEFAULT_LIVE_BASE_URL = "https://api.fxtwitter.com";
const DEFAULT_TIMEOUT_MS = 15_000;

function liveAvatar(url) {
  return typeof url === "string" ? url.replace(/_(?:normal|200x200)(\.[a-z]+)(\?.*)?$/i, "_400x400$1$2") : undefined;
}

function liveProfile(author, fallbackHandle) {
  const verification = author?.verification ?? {};
  const website = typeof author?.website === "string" ? author.website : author?.website?.url;
  return {
    handle: author?.screen_name ?? fallbackHandle,
    displayName: author?.name ?? author?.screen_name ?? fallbackHandle,
    bio: author?.description ?? author?.raw_description?.text ?? "",
    avatar: liveAvatar(author?.avatar_url),
    banner: author?.banner_url,
    followers: author?.followers,
    following: author?.following,
    posts: author?.statuses,
    joined: author?.joined,
    location: author?.location,
    website,
    verified: Boolean(verification.verified),
    isBlueVerified: verification.type === "blue",
    profileUrl: author?.url ?? `https://x.com/${author?.screen_name ?? fallbackHandle}`,
  };
}

function liveMedia(items) {
  return (items ?? []).map((item) => {
    const type = item.type === "video" ? "video" : ["gif", "animated_gif"].includes(item.type) ? "animated_gif" : "photo";
    const thumbnail = item.thumbnail_url ?? item.url;
    const media = {
      type,
      url: type === "photo" ? item.url : thumbnail,
      thumb: thumbnail,
      width: item.width,
      height: item.height,
    };
    if (type !== "photo") {
      const formats = (item.formats ?? [])
        .filter((format) => format.container === "mp4" && typeof format.url === "string")
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      media.video = {
        mp4: formats[0]?.url ?? item.url,
        poster: thumbnail,
        duration_ms: typeof item.duration === "number" ? Math.round(item.duration * 1000) : undefined,
      };
    }
    return media;
  });
}

function liveTweet(tweet) {
  const author = tweet?.author ?? {};
  const repostedBy = tweet?.reposted_by;
  const replyingTo = tweet?.replying_to;
  return {
    id: String(tweet?.id ?? ""),
    createdAt: tweet?.created_at ?? (tweet?.created_timestamp ? new Date(tweet.created_timestamp * 1000).toISOString() : ""),
    text: tweet?.text ?? tweet?.raw_text?.text ?? "",
    permalink: tweet?.url ?? `https://x.com/${author.screen_name ?? "i"}/status/${tweet?.id ?? ""}`,
    replies: tweet?.replies ?? 0,
    retweets: tweet?.reposts ?? 0,
    likes: tweet?.likes ?? 0,
    views: tweet?.views,
    quotes: tweet?.quotes,
    bookmarks: tweet?.bookmarks,
    media: liveMedia(tweet?.media?.all),
    isRetweet: Boolean(repostedBy),
    retweetedBy: repostedBy?.screen_name,
    retweetedByName: repostedBy?.name,
    isReply: Boolean(replyingTo),
    isSelfReply: Boolean(replyingTo?.screen_name && replyingTo.screen_name.toLowerCase() === author.screen_name?.toLowerCase()),
    sensitive: Boolean(tweet?.possibly_sensitive),
    authorName: author.name ?? author.screen_name,
    authorHandle: author.screen_name,
    authorAvatar: liveAvatar(author.avatar_url),
    authorVerified: Boolean(author.verification?.verified),
  };
}

/** Tweet Viewer API or transport error. */
export class TweetViewerError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number, code?: string, details?: unknown, cause?: unknown}} [options]
   */
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "TweetViewerError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

/**
 * Extract and validate an X handle from a handle or profile URL.
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeHandle(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new TweetViewerError("Xのユーザー名を指定してください。", { code: "INVALID_HANDLE" });
  }

  let value = input.trim();
  try {
    const url = new URL(value);
    if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname.toLowerCase())) {
      value = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (["tweetviewer.com", "www.tweetviewer.com"].includes(url.hostname.toLowerCase())) {
      const parts = url.pathname.split("/").filter(Boolean);
      const viewerIndex = parts.indexOf("twitter-viewer");
      value = viewerIndex >= 0 ? parts[viewerIndex + 1] ?? "" : "";
    }
  } catch {
    value = value.replace(/^@/, "");
  }

  if (!/^[A-Za-z0-9_]{2,15}$/.test(value)) {
    throw new TweetViewerError("Xのユーザー名は2〜15文字の英数字またはアンダースコアで指定してください。", {
      code: "INVALID_HANDLE",
    });
  }
  return value;
}

/**
 * Extract and validate a tweet ID from an ID or status URL.
 *
 * @param {string | number | bigint} input
 * @returns {string}
 */
export function normalizeTweetId(input) {
  const value = String(input).trim();
  const match = value.match(/(?:status|statuses)\/(\d{15,25})(?:\b|\/|\?|#)/i);
  const id = match?.[1] ?? value;
  if (!/^\d{15,25}$/.test(id)) {
    throw new TweetViewerError("15〜25桁のツイートID、またはXの投稿URLを指定してください。", {
      code: "INVALID_TWEET_ID",
    });
  }
  return id;
}

export class TweetViewerClient {
  /**
   * @param {import('./index.js').TweetViewerClientOptions} [options]
   */
  constructor(options = {}) {
    this.baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
    this.liveBaseUrl = new URL(options.liveBaseUrl ?? DEFAULT_LIVE_BASE_URL);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.headers = new Headers(options.headers);
    if (typeof this.fetch !== "function") {
      throw new TypeError("fetch implementation is required");
    }
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new TypeError("timeoutMs must be a positive number");
    }
  }

  /**
   * Resolve either a profile query or a tweet URL.
   *
   * @param {string} query
   * @param {{signal?: AbortSignal}} [options]
   */
  async view(query, options = {}) {
    if (typeof query !== "string" || query.trim() === "") {
      throw new TweetViewerError("検索文字列を指定してください。", { code: "INVALID_QUERY" });
    }
    const result = await this.#request("api/twitter/view", {
      method: "POST",
      body: JSON.stringify({ q: query.trim() }),
      headers: { "content-type": "application/json" },
      signal: options.signal,
    });
    if (result.kind !== "profile" && result.kind !== "tweet") {
      throw this.#unexpected(result);
    }
    return result;
  }

  /**
   * Fetch profile metadata.
   *
   * @param {string} handle
   * @param {{signal?: AbortSignal}} [options]
   */
  async getProfile(handle, options = {}) {
    const result = await this.view(normalizeHandle(handle), options);
    if (result.kind !== "profile") {
      throw new TweetViewerError("プロフィールレスポンスではありません。", {
        code: "UNEXPECTED_RESPONSE",
        details: result,
      });
    }
    return result;
  }

  /**
   * Fetch one page from the live timeline source used by Tweet Viewer's browser code.
   * This method calls FxTwitter directly; no cached timeline path is used.
   *
   * @param {string} handle
   * @param {{cursor?: string, signal?: AbortSignal}} [options]
   */
  async getTimeline(handle, options = {}) {
    const normalizedHandle = normalizeHandle(handle);
    const url = new URL(`2/profile/${encodeURIComponent(normalizedHandle)}/statuses`, this.liveBaseUrl);
    if (options.cursor) url.searchParams.set("cursor", options.cursor);
    const response = await this.#fetch(url.href, {
      signal: options.signal,
      referrerPolicy: "no-referrer",
      credentials: "omit",
    }, false);
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new TweetViewerError("ライブタイムラインからJSON以外のレスポンスが返されました。", {
        status: response.status,
        code: "INVALID_LIVE_JSON",
        details: text.slice(0, 500),
        cause: error,
      });
    }
    if (!response.ok || !data || data.code !== 200 || !Array.isArray(data.results)) {
      throw new TweetViewerError(data?.message ?? `Live timeline API error (${response.status})`, {
        status: response.status,
        code: "LIVE_API_ERROR",
        details: data,
      });
    }

    const author = data.results.find((tweet) => tweet?.author?.screen_name?.toLowerCase() === normalizedHandle.toLowerCase())?.author
      ?? data.results[0]?.author;
    return {
      ok: true,
      source: "fxtwitter-v2-live",
      profile: author ? liveProfile(author, normalizedHandle) : undefined,
      tweets: data.results.map(liveTweet),
      cursor: data.cursor?.bottom ?? null,
    };
  }

  /**
   * Compatibility alias for getTimeline(). Both methods are live-only.
   *
   * @param {string} handle
   * @param {{cursor?: string, signal?: AbortSignal}} [options]
   */
  async getLiveTimeline(handle, options = {}) {
    return this.getTimeline(handle, options);
  }

  /**
   * Fetch the newest live timeline item.
   *
   * @param {string} handle
   * @param {{includeReplies?: boolean, includeRetweets?: boolean, signal?: AbortSignal}} [options]
   */
  async getLatestTweet(handle, options = {}) {
    const timeline = await this.getTimeline(handle, { signal: options.signal });
    const tweets = timeline.tweets
      .filter((tweet) => options.includeReplies !== false || !tweet.isReply)
      .filter((tweet) => options.includeRetweets !== false || !tweet.isRetweet)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (!tweets[0]) {
      throw new TweetViewerError("取得できる投稿がありません。", { code: "NO_TWEETS" });
    }
    return tweets[0];
  }

  /**
   * Iterate timeline pages. Stops when the API returns no cursor.
   *
   * @param {string} handle
   * @param {{cursor?: string, maxPages?: number, signal?: AbortSignal}} [options]
   */
  async *iterateTimeline(handle, options = {}) {
    const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
    if (!(maxPages > 0)) {
      throw new TypeError("maxPages must be greater than zero");
    }

    let cursor = options.cursor;
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const page = await this.getTimeline(handle, { cursor, signal: options.signal });
      yield page;
      if (!page.cursor || page.cursor === cursor) return;
      cursor = page.cursor;
    }
  }

  /**
   * Fetch a single tweet.
   *
   * @param {string | number | bigint} idOrUrl
   * @param {{signal?: AbortSignal}} [options]
   */
  async getTweet(idOrUrl, options = {}) {
    const params = new URLSearchParams({ id: normalizeTweetId(idOrUrl) });
    const result = await this.#request(`api/twitter/tweet?${params}`, { signal: options.signal });
    if (!result.tweet || typeof result.tweet.id !== "string") throw this.#unexpected(result);
    return result;
  }

  /**
   * Resolve the downloadable media variants for a tweet.
   *
   * @param {string | number | bigint} idOrUrl
   * @param {{language?: string, signal?: AbortSignal}} [options]
   */
  async resolveMedia(idOrUrl, options = {}) {
    const id = normalizeTweetId(idOrUrl);
    const language = options.language ?? "en";
    if (!/^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/.test(language)) {
      throw new TweetViewerError("languageはenまたはja-JPのような言語コードで指定してください。", {
        code: "INVALID_LANGUAGE",
      });
    }
    const params = new URLSearchParams({
      url: `https://x.com/i/status/${id}`,
      lang: language.toLowerCase(),
    });
    const result = await this.#request(`api/resolve?${params}`, { signal: options.signal });
    if (!["video", "photo", "text"].includes(result.kind) || !Array.isArray(result.variants)) {
      throw this.#unexpected(result);
    }
    return result;
  }

  /**
   * Fetch media through Tweet Viewer's allow-listed file proxy.
   * The returned Response can be streamed or consumed with arrayBuffer()/blob().
   *
   * @param {string | URL} mediaUrl
   * @param {{range?: string, signal?: AbortSignal}} [options]
   * @returns {Promise<Response>}
   */
  async fetchMedia(mediaUrl, options = {}) {
    let source;
    try {
      source = new URL(mediaUrl);
    } catch (error) {
      throw new TweetViewerError("有効なメディアURLを指定してください。", {
        code: "INVALID_MEDIA_URL",
        cause: error,
      });
    }
    if (!["http:", "https:"].includes(source.protocol) || source.username || source.password) {
      throw new TweetViewerError("HTTPまたはHTTPSのメディアURLを指定してください。", {
        code: "INVALID_MEDIA_URL",
      });
    }
    if (options.range && !/^bytes=\d*-\d*(?:,\s*\d*-\d*)*$/.test(options.range)) {
      throw new TweetViewerError("rangeはbytes=0-1023の形式で指定してください。", {
        code: "INVALID_RANGE",
      });
    }

    const params = new URLSearchParams({ url: source.href });
    const response = await this.#fetch(`api/file?${params}`, {
      headers: {
        accept: "*/*",
        ...(options.range ? { range: options.range } : {}),
      },
      signal: options.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new TweetViewerError(text || `Tweet Viewer file API error (${response.status})`, {
        status: response.status,
        code: "FILE_API_ERROR",
        details: text.slice(0, 500),
      });
    }
    return response;
  }

  /** @param {unknown} details */
  #unexpected(details) {
    return new TweetViewerError("Tweet Viewerのレスポンス形式が変更された可能性があります。", {
      code: "UNEXPECTED_RESPONSE",
      details,
    });
  }

  /** @param {string} path @param {RequestInit} init */
  async #request(path, init = {}) {
    const response = await this.#fetch(path, init);
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new TweetViewerError("Tweet ViewerからJSON以外のレスポンスが返されました。", {
        status: response.status,
        code: "INVALID_JSON",
        details: text.slice(0, 500),
        cause: error,
      });
    }

    if (!response.ok || !data || data.ok !== true) {
      throw new TweetViewerError(data?.error ?? `Tweet Viewer API error (${response.status})`, {
        status: response.status,
        code: data?.code ?? "API_ERROR",
        details: data,
      });
    }
    return data;
  }

  /** @param {string} path @param {RequestInit} init @param {boolean} includeDefaultHeaders */
  async #fetch(path, init = {}, includeDefaultHeaders = true) {
    const url = new URL(path, this.baseUrl);
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const headers = includeDefaultHeaders ? new Headers(this.headers) : new Headers();
    for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
    if (!headers.has("accept")) headers.set("accept", "application/json");

    try {
      return await this.fetch(url, { ...init, headers, signal });
    } catch (error) {
      const aborted = signal.aborted;
      throw new TweetViewerError(aborted ? "Tweet Viewerへの接続がタイムアウトまたは中断されました。" : "Tweet Viewerへの接続に失敗しました。", {
        code: aborted ? "ABORTED" : "NETWORK_ERROR",
        cause: error,
      });
    }
  }
}

export const tweetViewer = new TweetViewerClient();
