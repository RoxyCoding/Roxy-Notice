import { YouTube } from 'yt-api-wrapper'

const CACHE_TTL_MS = 45_000
const MAX_ITEMS_PER_TYPE = 6
const cache = new Map()
const youtube = new YouTube({ region: 'JP', language: 'ja', timeZone: 'Asia/Tokyo', utcOffsetMinutes: 540, timeout: 20_000, retries: 2 })

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

function parseChannels(url) {
  const supplied = url.searchParams.get('channels') ?? process.env.YOUTUBE_CHANNELS ?? ''
  const channels = [...new Set(supplied.split(',').map((value) => value.trim()).filter(Boolean))]

  for (const channel of channels) {
    if (channel.length > 160 || !/^(@[\w.-]{3,}|UC[\w-]{22}|https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[^\s]+)$/i.test(channel)) {
      throw new Error(`チャンネル指定「${channel}」を確認してください。`)
    }
  }

  return channels
}

function thumbnailUrl(thumbnails) {
  return thumbnails?.at(-1)?.url ?? null
}

async function fetchChannelNotifications(channelInput) {
  const channelId = await youtube.resolveChannelId(channelInput)
  const warnings = []
  let channel = null
  let streams = []
  let posts = []

  const [channelResult, streamsResult, postsResult] = await Promise.allSettled([
    youtube.getChannel(channelId),
    youtube.getChannelStreams(channelId, { limit: MAX_ITEMS_PER_TYPE }),
    youtube.getCommunityPosts(channelId, { limit: MAX_ITEMS_PER_TYPE }),
  ])

  if (channelResult.status === 'fulfilled') channel = channelResult.value
  if (streamsResult.status === 'fulfilled') streams = streamsResult.value
  else warnings.push(`ライブ枠を取得できませんでした: ${streamsResult.reason instanceof Error ? streamsResult.reason.message : '不明なエラー'}`)

  if (postsResult.status === 'fulfilled') posts = postsResult.value
  else warnings.push(`投稿を取得できませんでした: ${postsResult.reason instanceof Error ? postsResult.reason.message : '不明なエラー'}`)

  const liveNotifications = streams
    .filter((video) => video.isUpcoming || video.isLive)
    .map((video) => ({
      id: `youtube:live:${video.id}`,
      kind: 'live',
      channelId,
      channelName: channel?.name ?? video.channel?.name ?? channelInput,
      avatarUrl: thumbnailUrl(channel?.thumbnails) ?? thumbnailUrl(video.channel?.thumbnails),
      title: video.title,
      body: video.isLive ? 'ライブ配信が始まりました。' : '',
      url: video.url,
      thumbnailUrl: thumbnailUrl(video.thumbnails),
      publishedText: video.publishedText,
      isLive: video.isLive,
      isUpcoming: video.isUpcoming,
    }))

  const postNotifications = posts.map((post) => ({
    id: `youtube:post:${post.id}`,
    kind: 'post',
    channelId,
    channelName: channel?.name ?? post.author.name ?? channelInput,
    avatarUrl: thumbnailUrl(channel?.thumbnails) ?? thumbnailUrl(post.author.thumbnails),
    title: '新しい投稿が公開されました',
    body: post.text || (post.pollChoices.length ? `アンケート: ${post.pollChoices.join(' / ')}` : '画像付きの投稿が公開されました。'),
    url: `https://www.youtube.com/post/${encodeURIComponent(post.id)}`,
    thumbnailUrl: thumbnailUrl(post.images) ?? thumbnailUrl(post.attachment?.thumbnails),
    publishedText: post.publishedText,
    isLive: false,
    isUpcoming: false,
  }))

  const fallbackName = channel?.name ?? liveNotifications[0]?.channelName ?? postNotifications[0]?.channelName ?? channelInput
  return {
    channel: { input: channelInput, id: channelId, name: fallbackName },
    notifications: [...liveNotifications, ...postNotifications],
    warnings,
  }
}

async function loadNotifications(channels) {
  const cacheKey = [...channels].sort().join('|')
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = (async () => {
    const results = []
    const warnings = []

    for (const channel of channels) {
      try {
        const result = await fetchChannelNotifications(channel)
        results.push(result)
        warnings.push(...result.warnings.map((message) => `${result.channel.name}: ${message}`))
      } catch (error) {
        warnings.push(`${channel}: ${error instanceof Error ? error.message : '取得に失敗しました'}`)
      }
    }

    return {
      fetchedAt: new Date().toISOString(),
      channels: results.map((result) => result.channel),
      notifications: results.flatMap((result) => result.notifications),
      warnings,
    }
  })()

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, promise })
  promise.catch(() => cache.delete(cacheKey))
  return promise
}

export async function handleYouTubeApi(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname !== '/api/youtube/notifications') return false

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    json(response, 405, { error: 'GETメソッドを使用してください。' })
    return true
  }

  try {
    const channels = parseChannels(url)
    if (!channels.length) {
      json(response, 200, { fetchedAt: new Date().toISOString(), channels: [], notifications: [], warnings: [] })
      return true
    }

    json(response, 200, await loadNotifications(channels))
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : 'YouTube通知の取得に失敗しました。' })
  }
  return true
}

export function youtubeApiPlugin() {
  const configure = (server) => {
    server.middlewares.use(async (request, response, next) => {
      try {
        if (!(await handleYouTubeApi(request, response))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return {
    name: 'roxy-youtube-api',
    configureServer: configure,
    configurePreviewServer: configure,
  }
}
