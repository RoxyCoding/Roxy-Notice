import type { Comment } from '../types/index.js';
import { channelUrl } from '../utils.js';
import { findAll, parseCount, readText, readThumbnails } from './common.js';

/** Parse every comment in a `next`/continuation response. */
export function parseComments(response: any): Comment[] {
  const comments: Comment[] = [];

  // Two shapes exist: the classic commentRenderer, and the newer view model
  // whose payload lives in a separate entity-mutation store. The view model
  // also carries a commentId, so dispatch on which container is present.
  for (const thread of findAll(response, 'commentThreadRenderer')) {
    const classic = thread?.comment?.commentRenderer;
    const parsed = classic?.commentId
      ? parseCommentRenderer(classic, thread)
      : parseCommentViewModel(thread, response);
    if (parsed) comments.push(parsed);
  }

  // Reply continuations arrive without a thread wrapper, in either shape.
  if (comments.length === 0) {
    for (const renderer of findAll(response, 'commentRenderer')) {
      const parsed = parseCommentRenderer(renderer, null);
      if (parsed) comments.push(parsed);
    }
    for (const view of findAll(response, 'commentViewModel')) {
      if (typeof view?.commentKey !== 'string') continue;
      const parsed = parseCommentViewModel({ commentViewModel: view }, response);
      if (parsed) comments.push(parsed);
    }
  }

  return comments;
}

function parseCommentRenderer(renderer: any, thread: any): Comment | null {
  const id = renderer?.commentId;
  if (typeof id !== 'string') return null;

  const authorId = renderer.authorEndpoint?.browseEndpoint?.browseId ?? null;
  const replyToken =
    thread?.replies?.commentRepliesRenderer?.contents?.[0]?.continuationItemRenderer
      ?.continuationEndpoint?.continuationCommand?.token ?? null;

  return {
    id,
    text: readText(renderer.contentText) ?? '',
    author: {
      id: authorId,
      name: readText(renderer.authorText) ?? '(unknown)',
      url: authorId ? channelUrl(authorId) : null,
      thumbnails: readThumbnails(renderer.authorThumbnail),
      verified: (renderer.authorCommentBadge?.authorCommentBadgeRenderer?.iconTooltip ?? '')
        .toLowerCase()
        .includes('verified'),
    },
    likeCount: parseCount(readText(renderer.voteCount)),
    publishedText: readText(renderer.publishedTimeText),
    replyCount: Number(renderer.replyCount) || (replyToken ? null : 0),
    isPinned: renderer.pinnedCommentBadge != null,
    isHearted: renderer.actionButtons?.commentActionButtonsRenderer?.creatorHeart != null,
    isAuthorChannelOwner: renderer.authorIsChannelOwner === true,
    repliesToken: replyToken,
  };
}

/** Newer view-model shape: payload lives in a separate mutation store. */
function parseCommentViewModel(thread: any, response: any): Comment | null {
  const view =
    thread?.commentViewModel?.commentViewModel ?? thread?.commentViewModel ?? null;
  const key = view?.commentKey;
  if (typeof key !== 'string') return null;

  const mutations: any[] = findAll(response, 'mutations').flat();
  const entity = mutations.find((m: any) => m?.entityKey === key)?.payload?.commentEntityPayload;
  if (!entity) return null;

  const authorId = entity.author?.channelId ?? null;
  const replyToken =
    thread?.replies?.commentRepliesRenderer?.contents?.[0]?.continuationItemRenderer
      ?.continuationEndpoint?.continuationCommand?.token ?? null;

  return {
    id: entity.properties?.commentId ?? key,
    text: entity.properties?.content?.content ?? '',
    author: {
      id: authorId,
      name: entity.author?.displayName ?? '(unknown)',
      url: authorId ? channelUrl(authorId) : null,
      thumbnails: entity.author?.avatarThumbnailUrl
        ? [{ url: entity.author.avatarThumbnailUrl, width: 88, height: 88 }]
        : [],
      verified: entity.author?.isVerified === true,
    },
    likeCount: parseCount(entity.toolbar?.likeCountLiked ?? entity.toolbar?.likeCountNotliked),
    publishedText: entity.properties?.publishedTime ?? null,
    replyCount: parseCount(entity.toolbar?.replyCount),
    isPinned: entity.properties?.pinnedText != null,
    isHearted: entity.toolbar?.heartState === 'TOOLBAR_HEART_STATE_HEARTED',
    isAuthorChannelOwner: entity.author?.isCreator === true,
    repliesToken: replyToken,
  };
}
