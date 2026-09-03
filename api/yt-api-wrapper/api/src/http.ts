import { NetworkError } from './errors.js';

export interface HttpOptions {
  /** Milliseconds before a request is aborted. Default 15000. */
  timeout?: number;
  /** How many times to retry transient failures (5xx, network). Default 2. */
  retries?: number;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Swap in your own fetch (proxy agents, caching, tests). */
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_RETRIES = 3;

/**
 * Thin fetch wrapper with timeout, retry-with-backoff and consistent errors.
 * YouTube rate-limits aggressively, so transient 429/5xx are retried.
 */
export class HttpClient {
  private readonly timeout: number;
  private readonly retries: number;
  private readonly baseHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpOptions = {}) {
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.baseHeaders = { ...options.headers };

    if (typeof this.fetchImpl !== 'function') {
      throw new NetworkError('global fetch is unavailable; pass options.fetch or use Node >= 18');
    }
  }

  /**
   * Fetch `url` and return the response body as text.
   *
   * The timeout covers the body transfer, not just the headers: YouTube will
   * happily send a 200 and then stall mid-body when it is throttling us, and
   * a header-only timeout would hang forever on that.
   */
  async text(url: string, init: RequestInit & { timeout?: number; retries?: number } = {}): Promise<string> {
    const { timeout: perCallTimeout, retries: perCallRetries, ...fetchInit } = init;
    const timeout = perCallTimeout ?? this.timeout;
    const retries = perCallRetries ?? this.retries;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await this.fetchImpl(url, {
          ...fetchInit,
          signal: controller.signal,
          headers: { ...this.baseHeaders, ...(fetchInit.headers as Record<string, string> | undefined) },
        });

        // 4xx other than 429 will not get better by retrying.
        if (response.status !== 429 && response.status < 500 && !response.ok) {
          throw new NetworkError(`YouTube responded ${response.status}`, response.status);
        }

        if (response.status === 429 || response.status >= 500) {
          lastError = new NetworkError(`YouTube responded ${response.status}`, response.status);
          if (attempt < retries) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw lastError;
        }

        return await response.text();
      } catch (error) {
        // A definitive client error is final; anything else may be transient.
        if (
          error instanceof NetworkError &&
          error.status !== undefined &&
          error.status < 500 &&
          error.status !== 429
        ) {
          throw error;
        }
        lastError = error;
        if (attempt < retries) {
          await sleep(backoffMs(attempt));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastError instanceof NetworkError) throw lastError;
    throw new NetworkError(`request to ${url} failed`, undefined, lastError);
  }

  async json<T = unknown>(url: string, init?: RequestInit & { timeout?: number; retries?: number }): Promise<T> {
    const body = await this.text(url, init);
    try {
      return JSON.parse(body) as T;
    } catch (error) {
      throw new NetworkError(`YouTube returned a non-JSON response for ${url}`, undefined, error);
    }
  }

  /** Escape hatch for callers that need the raw `Response` (streams, ranges). */
  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: { ...this.baseHeaders, ...(init.headers as Record<string, string> | undefined) },
      });
      if (!response.ok) {
        throw new NetworkError(`YouTube responded ${response.status}`, response.status);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}

function backoffMs(attempt: number): number {
  // 500ms, 1.5s, 4.5s ... with jitter so parallel callers desynchronise.
  // YouTube throttles bursts from one IP, so give it real room to recover.
  return 500 * 3 ** attempt + Math.floor(Math.random() * 400);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
