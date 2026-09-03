import { TweetViewerClient, normalizeHandle } from '../api/TweetViewer-API-Wrapper-Node.js-main/src/index.js'

const CACHE_TTL_MS = 45_000
const MAX_TWEETS_PER_USER = 12
const cache = new Map()
const x = new TweetViewerClient({ timeoutMs: 20_000 })

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

function parseUsers(url) {
  const supplied = url.searchParams.get('users') ?? process.env.X_USERS ?? ''
  const users = [...new Map(
    supplied
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        if (value.length > 160) throw new Error('Xユーザー名が長すぎます。')
        const handle = normalizeHandle(value)
        return [handle.toLocaleLowerCase('en'), handle]
      }),
  ).values()]

  return users
}

function mediaUrl(tweet) {
  const media = tweet.media?.[0]
  return media?.thumb ?? media?.video?.poster ?? media?.url ?? null
}

async function fetchUserTweets(handle) {
  const timeline = await x.getTimeline(handle)
  const profile = timeline.profile
  return {
    user: {
      handle: profile?.handle ?? handle,
      displayName: profile?.displayName ?? handle,
      avatarUrl: profile?.avatar ?? null,
    },
    items: timeline.tweets
      .filter((tweet) => tweet.id && !tweet.isRetweet)
      .slice(0, MAX_TWEETS_PER_USER)
      .map((tweet) => ({
        id: `x:${tweet.id}`,
        userHandle: profile?.handle ?? handle,
        authorHandle: tweet.authorHandle ?? profile?.handle ?? handle,
        authorName: tweet.authorName ?? profile?.displayName ?? handle,
        avatarUrl: tweet.authorAvatar ?? profile?.avatar ?? null,
        text: tweet.text,
        url: tweet.permalink,
        createdAt: tweet.createdAt,
        thumbnailUrl: mediaUrl(tweet),
        isReply: Boolean(tweet.isReply),
      })),
  }
}

async function loadNotifications(users) {
  const cacheKey = [...users].sort().join('|')
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = (async () => {
    const results = []
    const warnings = []

    for (const user of users) {
      try {
        results.push(await fetchUserTweets(user))
      } catch (error) {
        warnings.push(`@${user}: ${error instanceof Error ? error.message : '取得に失敗しました'}`)
      }
    }

    return {
      fetchedAt: new Date().toISOString(),
      users: results.map((result) => result.user),
      notifications: results
        .flatMap((result) => result.items)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)),
      warnings,
    }
  })()

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, promise })
  promise.catch(() => cache.delete(cacheKey))
  return promise
}

export async function handleXApi(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname !== '/api/x/notifications') return false

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    json(response, 405, { error: 'GETメソッドを使用してください。' })
    return true
  }

  try {
    const users = parseUsers(url)
    if (!users.length) {
      json(response, 200, { fetchedAt: new Date().toISOString(), users: [], notifications: [], warnings: [] })
      return true
    }
    json(response, 200, await loadNotifications(users))
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : 'X通知の取得に失敗しました。' })
  }
  return true
}

export function xApiPlugin() {
  const configure = (server) => {
    server.middlewares.use(async (request, response, next) => {
      try {
        if (!(await handleXApi(request, response))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return {
    name: 'roxy-x-api',
    configureServer: configure,
    configurePreviewServer: configure,
  }
}
