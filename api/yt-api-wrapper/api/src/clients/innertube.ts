import { HttpClient } from '../http.js';
import { NetworkError, ParseError } from '../errors.js';

/**
 * InnerTube is the private JSON API the YouTube apps themselves call.
 * Each "client" identity unlocks slightly different data, so we keep a few.
 */
export interface InnerTubeClientConfig {
  clientName: string;
  clientVersion: string;
  /** Numeric id InnerTube expects in the X-YouTube-Client-Name header. */
  clientNameId: number;
  userAgent: string;
  /** Extra fields merged into context.client. */
  extra?: Record<string, unknown>;
}

export const CLIENTS: Record<string, InnerTubeClientConfig> = {
  /** Desktop web: richest browse/search metadata. Cannot resolve streams. */
  WEB: {
    clientName: 'WEB',
    clientVersion: '2.20260828.01.00',
    clientNameId: 1,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  },
  /** Mobile web: same data as WEB, occasionally less throttled. */
  MWEB: {
    clientName: 'MWEB',
    clientVersion: '2.20260828.01.00',
    clientNameId: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
  },
  /** Android: the only client that still returns plain, ready-to-use stream URLs. */
  ANDROID: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    clientNameId: 3,
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
    extra: { androidSdkVersion: 34, osName: 'Android', osVersion: '14', platform: 'MOBILE' },
  },
  /** iOS: adaptive-only fallback when ANDROID is throttled. */
  IOS: {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    clientNameId: 5,
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)',
    extra: {
      osName: 'iPhone',
      osVersion: '18.3.0.22D63',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      platform: 'MOBILE',
    },
  },
  /**
   * Apple Vision Pro. Currently the most reliable client for videos that
   * answer 403 partway through a download on ANDROID/IOS — those are served
   * unthrottled here. Does not carry "made for kids" videos.
   */
  VISIONOS: {
    clientName: 'VISIONOS',
    clientVersion: '1.02',
    clientNameId: 101,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    extra: {
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice17,1',
      osName: 'visionOS',
      osVersion: '26.5.23O471',
    },
  },

  /** TV client: sometimes bypasses age gates on older videos. */
  TV_EMBEDDED: {
    clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    clientVersion: '2.0',
    clientNameId: 85,
    userAgent: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  },
};

/** Public InnerTube key shipped in every YouTube web page. Not a secret. */
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const BASE_URL = 'https://www.youtube.com/youtubei/v1';

export interface InnerTubeOptions {
  http: HttpClient;
  /** Which client identity to use. Default WEB. */
  client?: keyof typeof CLIENTS;
  /** ISO country code, e.g. "JP". Affects trending and availability. */
  region?: string;
  /** UI language, e.g. "ja". */
  language?: string;
  /** IANA time zone used for localized dates, e.g. "Asia/Tokyo". */
  timeZone?: string;
  /** Current offset from UTC in minutes. */
  utcOffsetMinutes?: number;
  /** Cookie header for logged-in requests (optional, advanced). */
  cookie?: string;
  /** Reuse an already-bootstrapped visitor identity across clients. */
  visitorData?: string;
}

/** Low-level InnerTube transport: builds the context envelope and posts it. */
export class InnerTube {
  private readonly http: HttpClient;
  readonly client: InnerTubeClientConfig;
  readonly region: string;
  readonly language: string;
  readonly timeZone?: string;
  readonly utcOffsetMinutes?: number;
  private readonly cookie?: string;
  /** Anonymous visitor identity; YouTube rejects `player` calls without one. */
  private visitorData: string | null;
  private visitorPromise: Promise<string | null> | null = null;

  constructor(options: InnerTubeOptions) {
    this.http = options.http;
    this.client = CLIENTS[options.client ?? 'WEB'];
    this.region = options.region ?? 'US';
    this.language = options.language ?? 'en';
    this.timeZone = options.timeZone;
    this.utcOffsetMinutes = options.utcOffsetMinutes;
    this.cookie = options.cookie;
    this.visitorData = options.visitorData ?? null;
  }

  /**
   * Fetch (once) an anonymous visitor id from the YouTube homepage.
   * Requests without it are treated as untrusted and get UNPLAYABLE back.
   * Failure is non-fatal: browse/search still work without it.
   */
  async ensureVisitorData(): Promise<string | null> {
    if (this.visitorData) return this.visitorData;
    if (this.visitorPromise) return this.visitorPromise;

    this.visitorPromise = this.page('/')
      .then((html) => {
        this.visitorData = html.match(/"visitorData":"(.*?)"/)?.[1] ?? null;
        return this.visitorData;
      })
      .catch(() => null)
      .finally(() => {
        this.visitorPromise = null;
      });

    return this.visitorPromise;
  }

  /** Return a copy of this transport bound to a different client identity. */
  withClient(client: keyof typeof CLIENTS): InnerTube {
    return new InnerTube({
      http: this.http,
      client,
      region: this.region,
      language: this.language,
      timeZone: this.timeZone,
      utcOffsetMinutes: this.utcOffsetMinutes,
      cookie: this.cookie,
      visitorData: this.visitorData ?? undefined,
    });
  }

  private buildContext(): Record<string, unknown> {
    return {
      client: {
        clientName: this.client.clientName,
        clientVersion: this.client.clientVersion,
        hl: this.language,
        gl: this.region,
        ...(this.timeZone ? { timeZone: this.timeZone } : {}),
        ...(this.utcOffsetMinutes != null ? { utcOffsetMinutes: this.utcOffsetMinutes } : {}),
        userAgent: this.client.userAgent,
        ...(this.visitorData ? { visitorData: this.visitorData } : {}),
        ...this.client.extra,
      },
      user: { lockedSafetyMode: false },
      request: { useSsl: true },
    };
  }

  /** Post to an InnerTube endpoint such as "player", "search" or "browse". */
  async call<T = any>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> {
    // `player` is the endpoint YouTube gates on a visitor identity.
    if (endpoint === 'player') await this.ensureVisitorData();

    const url = `${BASE_URL}/${endpoint}?key=${INNERTUBE_KEY}&prettyPrint=false`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this.client.userAgent,
      'X-YouTube-Client-Name': String(this.client.clientNameId),
      'X-YouTube-Client-Version': this.client.clientVersion,
      'Accept-Language': `${this.language},en;q=0.9`,
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    };
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.visitorData) headers['X-Goog-Visitor-Id'] = this.visitorData;

    const body = JSON.stringify({ context: this.buildContext(), ...payload });
    const data = await this.http.json<T>(url, { method: 'POST', headers, body });

    if (data == null || typeof data !== 'object') {
      throw new ParseError(`InnerTube ${endpoint} returned a non-object response`);
    }
    return data;
  }

  /** Fetch an ordinary youtube.com HTML page (used for ytInitialData scraping). */
  async page(path: string): Promise<string> {
    const url = path.startsWith('http') ? path : `https://www.youtube.com${path}`;
    return this.http.text(url, {
      headers: {
        'User-Agent': CLIENTS.WEB.userAgent,
        'Accept-Language': `${this.language},en;q=0.9`,
        Cookie: this.cookie ?? `PREF=hl=${this.language}&gl=${this.region}; SOCS=CAI`,
      },
    });
  }

  /** Follow a continuation token on any browsable endpoint. */
  async continue<T = any>(endpoint: string, token: string): Promise<T> {
    return this.call<T>(endpoint, { continuation: token });
  }
}

/** Extract the `ytInitialData` / `ytInitialPlayerResponse` blobs from an HTML page. */
export function extractInitialData(html: string, variable: string): any {
  const marker = `${variable} = `;
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new ParseError(`${variable} not found in page (YouTube markup may have changed)`);
  }
  const jsonStart = start + marker.length;
  const json = sliceBalancedJson(html, jsonStart);
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new ParseError(`failed to parse ${variable}`, error);
  }
}

/**
 * Walk forward from `start` and return the complete top-level JSON value,
 * respecting strings and escapes so that braces inside text do not fool us.
 */
function sliceBalancedJson(source: string, start: number): string {
  const open = source[start];
  const close = open === '[' ? ']' : '}';
  if (open !== '[' && open !== '{') {
    throw new ParseError('expected a JSON object or array');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new ParseError('unterminated JSON blob in page');
}

export { INNERTUBE_KEY, NetworkError };
