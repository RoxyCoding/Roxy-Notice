/** Base class for every error thrown by this library. */
export class YouTubeError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

/** A network / HTTP-level failure while talking to YouTube. */
export class NetworkError extends YouTubeError {
  constructor(message: string, readonly status?: number, cause?: unknown) {
    super(message, cause);
  }
}

/** YouTube answered, but the payload could not be understood. */
export class ParseError extends YouTubeError {}

/** The requested resource does not exist, is private, or is region blocked. */
export class UnavailableError extends YouTubeError {
  constructor(message: string, readonly reason?: string) {
    super(message);
  }
}

/**
 * The video exists but is gated behind a channel membership.
 *
 * YouTube states the required tier in the reason text, which `requiredTier`
 * extracts when it can be recognised.
 */
export class MembersOnlyError extends UnavailableError {
  constructor(message: string, readonly requiredTier: string | null = null) {
    super(message, 'MEMBERS_ONLY');
  }
}

/** The caller passed something invalid (bad id, bad URL, bad option). */
export class InvalidArgumentError extends YouTubeError {}
