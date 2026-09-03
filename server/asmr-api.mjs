const CACHE_TTL_MS = 4 * 60_000
const MAX_ITEMS_PER_SOURCE = 8
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36'
const SOURCES = [
  { name: 'anime-sharing', label: 'anime-sharing / Erotic Games', url: 'https://www.anime-sharing.com/forums/erotic.130/index.rss' },
  { name: 'vivahentai4u', label: 'vivahentai4u / Hentai Voice', url: 'https://www.vivahentai4u.net/category/hentai-voice/feed/' },
  { name: 'erovoice', label: 'erovoice', url: 'http://e.erovoice.us/feeds/posts/default?alt=rss&max-results=25' },
]

let cache = null
const workCache = new Map()

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

function decode(value = '') {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return value
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code[0].toLowerCase() === 'x' ? code.slice(1) : code, code[0].toLowerCase() === 'x' ? 16 : 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => entities[name.toLowerCase()])
    .trim()
}

function tag(xml, name) {
  return decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '')
}

function imageUrl(xml) {
  const content = tag(xml, 'content:encoded') || tag(xml, 'description')
  let url = content.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)?.[1]
    ?? xml.match(/<media:thumbnail[^>]+url\s*=\s*["']([^"']+)["']/i)?.[1]
  if (!url) return null
  url = decode(url)
  if (url.startsWith('//')) url = `https:${url}`
  if (/blogger\.googleusercontent\.com|bp\.blogspot\.com/i.test(url)) url = url.replace(/\/s\d+(?:-[wh]\d+)*(?:-c)?\//, '/s1600/')
  return /^https?:\/\//i.test(url) ? url : null
}

function parseFeed(xml, source) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const item = match[1]
      const link = tag(item, 'link')
      const title = tag(item, 'title').replace(/<[^>]+>/g, '').trim()
      if (!link || !title) return null
      const publishedAt = tag(item, 'pubDate')
      return {
        id: `asmr:${source.name}:${tag(item, 'guid') || link}`,
        source: source.label,
        title,
        url: link,
        author: tag(item, 'dc:creator') || tag(item, 'author') || source.name,
        publishedAt: Number.isNaN(Date.parse(publishedAt)) ? null : new Date(publishedAt).toISOString(),
        thumbnailUrl: imageUrl(item),
      }
    })
    .filter(Boolean)
    .slice(0, MAX_ITEMS_PER_SOURCE)
}

function workNumber(...values) {
  for (const value of values) {
    const match = value?.match(/(?<![A-Za-z0-9])([RVB]J\d{6,10})(?!\d)/i)
    if (match) return match[1].toUpperCase()
  }
  return null
}

function creatorNames(data, key) {
  return (data?.creaters?.[key] ?? []).map((entry) => String(entry?.name ?? '').trim()).filter(Boolean)
}

async function fetchWork(workno) {
  if (!workno) return null
  if (workCache.has(workno)) return workCache.get(workno)
  let work = null
  try {
    const response = await fetch(`https://www.dlsite.com/maniax/api/=/product.json?workno=${workno}`, { signal: AbortSignal.timeout(15_000) })
    const data = response.ok ? await response.json() : null
    const item = Array.isArray(data) ? data[0] : null
    if (item && typeof item === 'object') {
      let image = item.image_main?.url ?? (typeof item.image_thumb === 'string' ? item.image_thumb : null)
      if (image?.startsWith('//')) image = `https:${image}`
      work = {
        workno,
        url: `https://www.dlsite.com/maniax/work/=/product_id/${workno}.html`,
        maker: item.maker_name || null,
        price: Number.isFinite(Number(item.price)) ? Number(item.price) : null,
        image,
        voice: creatorNames(item, 'voice_by'),
        scenario: creatorNames(item, 'scenario_by'),
        illust: creatorNames(item, 'illust_by'),
      }
    }
  } catch {
    // RSS項目はDLsiteの補完に失敗しても表示する。
  }
  if (workCache.size >= 1000) workCache.clear()
  workCache.set(workno, work)
  return work
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { Accept: 'application/rss+xml, application/xml', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const items = parseFeed(await response.text(), source)
  return Promise.all(items.map(async (item) => {
    const work = await fetchWork(workNumber(item.title, item.url, item.thumbnailUrl))
    return {
      ...item,
      thumbnailUrl: item.thumbnailUrl ?? work?.image ?? null,
      dlsiteUrl: work?.url ?? null,
      maker: work?.maker ?? null,
      price: work?.price ?? null,
      voice: work?.voice ?? [],
      scenario: work?.scenario ?? [],
      illust: work?.illust ?? [],
    }
  }))
}

async function loadNotifications() {
  if (cache && cache.expiresAt > Date.now()) return cache.promise
  const promise = (async () => {
    const results = await Promise.allSettled(SOURCES.map(fetchSource))
    const warnings = results.flatMap((result, index) => result.status === 'rejected' ? [`${SOURCES[index].label}: ${result.reason instanceof Error ? result.reason.message : '取得に失敗しました'}`] : [])
    const notifications = results
      .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    return { fetchedAt: new Date().toISOString(), sources: SOURCES.map(({ name, label }) => ({ name, label })), notifications, warnings }
  })()
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, promise }
  promise.catch(() => { cache = null })
  return promise
}

export async function handleAsmrApi(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname !== '/api/asmr/notifications') return false
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    json(response, 405, { error: 'GETメソッドを使用してください。' })
    return true
  }
  try {
    json(response, 200, await loadNotifications())
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : 'ASMR通知の取得に失敗しました。' })
  }
  return true
}

export function asmrApiPlugin() {
  const configure = (server) => {
    server.middlewares.use(async (request, response, next) => {
      try {
        if (!(await handleAsmrApi(request, response))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return { name: 'roxy-asmr-api', configureServer: configure, configurePreviewServer: configure }
}
