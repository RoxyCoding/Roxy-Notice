import type {
  ChatEmoji,
  CommunityPost,
  LiveChatMessage,
  PlaylistCompact,
  VideoCompact,
} from '../types/index.js';
import { channelUrl } from '../utils.js';
import { findAll, readText, readThumbnails } from './common.js';
import { parsePlaylistRenderer, parseVideoRenderer } from './renderers.js';

/** Parse every community post in a browse response. */
export function parseCommunityPosts(response: any): CommunityPost[] {
  const posts: CommunityPost[] = [];

  // `backstagePostRenderer` is the current shape; `postRenderer` still appears
  // on some surfaces. A post with no text (image- or poll-only) is valid data.
  const renderers = [
    ...findAll(response, 'backstagePostRenderer'),
    ...findAll(response, 'postRenderer'),
  ];
  const seen = new Set<string>();

  for (const renderer of renderers) {
    if (typeof renderer?.postId === 'string') {
      if (seen.has(renderer.postId)) continue;
      seen.add(renderer.postId);
    }
    const id = renderer?.postId;
    if (typeof id !== 'string') continue;

    const authorId = renderer.authorEndpoint?.browseEndpoint?.browseId ?? null;
    const attachment = renderer.backstageAttachment ?? {};

    posts.push({
      id,
      text: readText(renderer.contentText) ?? '',
      author: {
        id: authorId,
        name: readText(renderer.authorText) ?? '(unknown)',
        url: authorId ? channelUrl(authorId) : null,
        thumbnails: readThumbnails(renderer.authorThumbnail),
        verified: false,
      },
      publishedText: readText(renderer.publishedTimeText),
      likeCountText: readText(renderer.voteCount),
      replyCountText: readText(
        renderer.actionButtons?.commentActionButtonsRenderer?.replyButton?.buttonRenderer?.text,
      ),
      images: readThumbnails(
        attachment.backstageImageRenderer?.image ??
          attachment.postMultiImageRenderer?.images?.[0]?.backstageImageRenderer?.image,
      ),
      attachment: parseAttachment(attachment),
      pollChoices: (attachment.pollRenderer?.choices ?? [])
        .map((choice: any) => readText(choice?.text))
        .filter((text: any): text is string => typeof text === 'string'),
    });
  }

  return posts;
}

/** A post may embed a video or a playlist. */
function parseAttachment(attachment: any): VideoCompact | PlaylistCompact | null {
  if (attachment?.videoRenderer) return parseVideoRenderer(attachment.videoRenderer);
  if (attachment?.playlistRenderer) return parsePlaylistRenderer(attachment.playlistRenderer);
  return null;
}

/**
 * Read a chat message body.
 *
 * Chat runs mix plain text with custom emoji, and an emoji run carries no
 * `text` at all — a sticker-only message would otherwise read as empty. Fall
 * back to the emoji's `:shortcut:` so every message has something to show.
 */
function readChatText(node: any): string | null {
  if (node == null) return null;
  if (!Array.isArray(node.runs)) return readText(node);

  const text = node.runs
    .map((run: any) => {
      if (typeof run?.text === 'string') return run.text;
      const emoji = run?.emoji;
      if (!emoji) return '';
      // Prefer the readable `:name:` shortcut over the raw emoji id.
      return emoji.shortcuts?.[0] ?? emoji.emojiId ?? '';
    })
    .join('');

  return text.length > 0 ? text : null;
}

/** Collect the emoji and stickers used in a message. */
function readChatEmojis(node: any): ChatEmoji[] {
  if (!Array.isArray(node?.runs)) return [];

  const emojis: ChatEmoji[] = [];
  for (const run of node.runs) {
    const emoji = run?.emoji;
    if (!emoji) continue;

    const id: string = emoji.emojiId ?? '';
    emojis.push({
      shortcut: emoji.shortcuts?.[0] ?? id,
      id,
      // Standard emoji use the character itself as the id; a channel sticker
      // uses a long "<channelId>/<stickerId>" string.
      isCustom: emoji.isCustomEmoji === true || id.includes('/'),
      thumbnails: readThumbnails(emoji.image),
    });
  }

  return emojis;
}

/**
 * Read the membership length out of a badge label.
 *
 * YouTube localises these ("メンバー（2 年）", "Member (2 months)"), and a new
 * member's badge states no duration at all, so return null rather than 0 when
 * no number is present.
 */
function parseMemberMonths(badge: string | null): number | null {
  if (!badge) return null;

  const value = Number(badge.match(/(\d+)/)?.[1]);
  if (!Number.isFinite(value)) return null;

  return /年|year/i.test(badge) ? value * 12 : value;
}

/** Parse a `live_chat/get_live_chat` response into messages. */
export function parseLiveChatMessages(response: any): LiveChatMessage[] {
  const messages: LiveChatMessage[] = [];

  for (const action of findAll(response, 'addChatItemAction')) {
    const item = action?.item ?? {};
    const renderer =
      item.liveChatTextMessageRenderer ??
      item.liveChatPaidMessageRenderer ??
      item.liveChatPaidStickerRenderer ??
      item.liveChatMembershipItemRenderer;

    if (!renderer?.id) continue;

    const authorId = renderer.authorExternalChannelId ?? null;
    const badgeRenderers: any[] = (renderer.authorBadges ?? [])
      .map((badge: any) => badge?.liveChatAuthorBadgeRenderer)
      .filter(Boolean);

    // `icon.iconType` identifies the built-in roles (OWNER / MODERATOR /
    // VERIFIED); a membership badge has no icon but a custom thumbnail plus
    // localised text such as "メンバー（2 年）" or "Member (2 years)".
    const iconTypes: string[] = badgeRenderers
      .map((badge: any) => badge?.icon?.iconType ?? '')
      .filter(Boolean);
    const memberBadgeRenderer =
      badgeRenderers.find((badge: any) => badge?.customThumbnail && !badge?.icon?.iconType) ?? null;
    const memberBadge =
      memberBadgeRenderer?.tooltip ??
      memberBadgeRenderer?.accessibility?.accessibilityData?.label ??
      null;

    messages.push({
      id: renderer.id,
      text:
        readChatText(renderer.message) ??
        readChatText(renderer.headerSubtext) ??
        readText(renderer.purchaseAmountText) ??
        '',
      author: {
        id: authorId,
        name: readText(renderer.authorName) ?? '(unknown)',
        url: authorId ? channelUrl(authorId) : null,
        thumbnails: readThumbnails(renderer.authorPhoto),
        verified: iconTypes.includes('VERIFIED'),
      },
      timestampUsec: Number(renderer.timestampUsec) || 0,
      purchaseAmount: readText(renderer.purchaseAmountText),
      isModerator: iconTypes.includes('MODERATOR'),
      isOwner: iconTypes.includes('OWNER'),
      // A membership gift or join event also marks the author as a member.
      isMember: memberBadge != null || item.liveChatMembershipItemRenderer != null,
      memberBadge,
      memberMonths: parseMemberMonths(memberBadge),
      memberBadgeThumbnails: readThumbnails(memberBadgeRenderer?.customThumbnail),
      emojis: readChatEmojis(renderer.message),
    });
  }

  return messages;
}
