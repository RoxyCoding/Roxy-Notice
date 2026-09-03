import type { SearchOptions } from '../types/index.js';

/**
 * YouTube's `sp` search parameter is a base64url-encoded protobuf message.
 * We hand-encode the handful of fields we need rather than pulling in a
 * protobuf runtime.
 *
 * Layout (field numbers from the searchFilter message):
 *   1: sortBy (varint, top level)
 *   2: filters submessage
 *     1 uploadDate, 2 type, 3 duration,
 *     4 hd, 5 subtitles, 6 creativeCommons, 14 4k, 8 live, 15 360, 25 hdr, 26 vr180
 */
export function encodeSearchFilters(options: SearchOptions): string | null {
  const sortValues = { relevance: 0, date: 1, views: 2, rating: 3 } as const;
  const uploadValues = { hour: 1, today: 2, week: 3, month: 4, year: 5 } as const;
  const typeValues = { video: 1, channel: 2, playlist: 3, movie: 4 } as const;
  const durationValues = { short: 1, medium: 3, long: 2 } as const;
  const featureFields = {
    hd: 4, subtitles: 5, creativeCommons: 6, '4k': 14, live: 8, '360': 15, hdr: 25, vr180: 26,
  } as const;

  const filters: number[] = [];
  if (options.uploadDate) filters.push(...varintField(1, uploadValues[options.uploadDate]));
  if (options.type && options.type !== 'all') filters.push(...varintField(2, typeValues[options.type]));
  if (options.duration) filters.push(...varintField(3, durationValues[options.duration]));
  for (const feature of options.features ?? []) {
    const field = featureFields[feature];
    if (field != null) filters.push(...varintField(field, 1));
  }

  const message: number[] = [];
  if (options.sortBy && options.sortBy !== 'relevance') {
    message.push(...varintField(1, sortValues[options.sortBy]));
  }
  if (filters.length > 0) {
    message.push(...lengthDelimitedField(2, filters));
  }

  if (message.length === 0) return null;
  return base64UrlEncode(Uint8Array.from(message));
}

/** Encode `field: value` as a protobuf varint field. */
function varintField(field: number, value: number): number[] {
  return [(field << 3) | 0, ...varint(value)];
}

/** Encode `field: <bytes>` as a protobuf length-delimited field. */
function lengthDelimitedField(field: number, bytes: number[]): number[] {
  return [(field << 3) | 2, ...varint(bytes.length), ...bytes];
}

function varint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
