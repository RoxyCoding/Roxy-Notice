import { useCallback, useEffect, useRef, useState } from 'react'

export type YouTubeLiveFilterMode = 'exclude' | 'include'

export type YouTubeLiveFilter = { mode: YouTubeLiveFilterMode; words: string[] }

export type YouTubeLiveFilters = Record<string, YouTubeLiveFilter>

export type YouTubeNotificationItem = {
  id: string
  kind: 'live' | 'post'
  channelId: string
  channelInput: string
  channelName: string
  avatarUrl: string | null
  title: string
  body: string
  url: string
  thumbnailUrl: string | null
  publishedText: string | null
  publishedAt: string | null
  isLive: boolean
  isUpcoming: boolean
}

type YouTubeApiResponse = {
  fetchedAt: string
  channels: Array<{ input: string; id: string; name: string }>
  notifications: YouTubeNotificationItem[]
  warnings: string[]
  error?: string
}

const CHANNEL_STORAGE_KEY = 'roxy-notice:youtube-channels'
const API_KEY_STORAGE_KEY = 'roxy-notice:youtube-api-key'
const READ_STORAGE_KEY = 'roxy-notice:youtube-read-items'
const NOTIFIED_STORAGE_KEY = 'roxy-notice:youtube-notified-items'
const LIVE_SCHEDULE_STORAGE_KEY = 'roxy-notice:youtube-live-schedules'
const LIVE_FILTER_STORAGE_KEY = 'roxy-notice:youtube-live-filters'

export function loadYouTubeApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
}

export function saveYouTubeApiKey(apiKey: string) {
  if (apiKey.trim()) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim())
  else localStorage.removeItem(API_KEY_STORAGE_KEY)
}

function isValidYouTubeApiKey(apiKey: string) {
  return /^AIza[\w-]{35}$/.test(apiKey.trim())
}

async function youtubeGet<T>(resource: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const query = new URLSearchParams({ ...params, key: apiKey })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${query}`)
  const data = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) throw new Error(data.error?.message || `YouTube Data APIエラー（${response.status}）`)
  return data
}

function channelLookup(input: string): Record<string, string> {
  const trimmed = input.trim()
  if (/^UC[\w-]{22}$/.test(trimmed)) return { id: trimmed }
  if (trimmed.startsWith('@')) return { forHandle: trimmed.slice(1) }
  const url = new URL(trimmed)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'channel' && parts[1]) return { id: parts[1] }
  if (parts[0]?.startsWith('@')) return { forHandle: parts[0].slice(1) }
  throw new Error(`チャンネル指定「${input}」は、@ハンドルまたはUC形式のIDを使用してください。`)
}

async function fetchYouTubeNotifications(channels: string[], apiKey: string): Promise<YouTubeApiResponse> {
  const notifications: YouTubeNotificationItem[] = []
  const resolvedChannels: YouTubeApiResponse['channels'] = []
  const warnings: string[] = []

  for (const input of channels) {
    try {
      const channelData = await youtubeGet<{ items?: Array<{ id: string; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
        'channels',
        { part: 'snippet,contentDetails', ...channelLookup(input) },
        apiKey,
      )
      const channel = channelData.items?.[0]
      const uploads = channel?.contentDetails?.relatedPlaylists?.uploads
      if (!channel || !uploads) throw new Error('チャンネルが見つかりません。')

      const playlist = await youtubeGet<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>(
        'playlistItems',
        { part: 'contentDetails', playlistId: uploads, maxResults: '12' },
        apiKey,
      )
      const ids = (playlist.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => Boolean(id))
      const videos = ids.length
        ? await youtubeGet<{ items?: Array<{ id: string; snippet?: { title?: string; description?: string; publishedAt?: string; liveBroadcastContent?: string; thumbnails?: Record<string, { url?: string }> }; liveStreamingDetails?: { scheduledStartTime?: string; actualStartTime?: string } }> }>(
          'videos',
          { part: 'snippet,liveStreamingDetails', id: ids.join(',') },
          apiKey,
        )
        : { items: [] }
      const thumbnails = channel.snippet?.thumbnails
      const avatarUrl = thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null
      const channelName = channel.snippet?.title ?? input
      resolvedChannels.push({ input, id: channel.id, name: channelName })

      for (const video of videos.items ?? []) {
        const scheduled = video.liveStreamingDetails?.scheduledStartTime
        const isLive = video.snippet?.liveBroadcastContent === 'live'
        const isUpcoming = video.snippet?.liveBroadcastContent === 'upcoming'
        const published = scheduled ?? video.snippet?.publishedAt ?? null
        const videoThumbs = video.snippet?.thumbnails
        notifications.push({
          id: `youtube:${isLive || isUpcoming ? 'live' : 'post'}:${video.id}`,
          kind: isLive || isUpcoming ? 'live' : 'post',
          channelId: channel.id,
          channelInput: input,
          channelName,
          avatarUrl,
          title: video.snippet?.title ?? 'YouTube動画',
          body: video.snippet?.description?.slice(0, 240) || (isLive ? 'ライブ配信中です。' : '新しい動画が公開されました。'),
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
          thumbnailUrl: videoThumbs?.high?.url ?? videoThumbs?.medium?.url ?? videoThumbs?.default?.url ?? null,
          publishedText: published ? new Date(published).toLocaleString('ja-JP') : null,
          publishedAt: published,
          isLive,
          isUpcoming,
        })
      }
    } catch (error) {
      warnings.push(`${input}: ${error instanceof Error ? error.message : '取得に失敗しました。'}`)
    }
  }

  return { fetchedAt: new Date().toISOString(), channels: resolvedChannels, notifications, warnings }
}

function loadStringArray(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function loadStringRecord(key: string): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {}
  } catch {
    return {}
  }
}

export function loadYouTubeChannels() {
  return loadStringArray(CHANNEL_STORAGE_KEY)
}

export function saveYouTubeChannels(channels: string[]) {
  localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(channels))
}

export function loadYouTubeLiveFilters(): YouTubeLiveFilters {
  try {
    const value = JSON.parse(localStorage.getItem(LIVE_FILTER_STORAGE_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const entries = Object.entries(value as Record<string, unknown>).flatMap(([channel, filter]): Array<[string, YouTubeLiveFilter]> => {
      if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return []
      const { mode, words } = filter as { mode?: unknown; words?: unknown }
      return [[channel, {
        mode: mode === 'include' ? 'include' : 'exclude',
        words: Array.isArray(words) ? words.filter((word): word is string => typeof word === 'string') : [],
      }]]
    })
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export function saveYouTubeLiveFilters(filters: YouTubeLiveFilters) {
  localStorage.setItem(LIVE_FILTER_STORAGE_KEY, JSON.stringify(filters))
}

export function isHiddenYouTubeLive(item: YouTubeNotificationItem, filters: YouTubeLiveFilters) {
  if (item.kind !== 'live') return false
  const filter = filters[item.channelInput]
  if (!filter) return false
  const keywords = filter.words.map((word) => word.trim().toLocaleLowerCase('ja')).filter((word) => word.length > 0)
  if (!keywords.length) return false
  const title = item.title.toLocaleLowerCase('ja')
  const matched = keywords.some((keyword) => title.includes(keyword))
  return filter.mode === 'include' ? !matched : matched
}

export function loadReadYouTubeItems() {
  return loadStringArray(READ_STORAGE_KEY)
}

export function saveReadYouTubeItems(ids: string[]) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids.slice(-200)))
}

export function isValidYouTubeChannel(value: string) {
  return /^(@[\w.-]{3,}|UC[\w-]{22}|https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[^\s]+)$/i.test(value.trim())
}

export function isRecentYouTubeItem(item: YouTubeNotificationItem) {
  if (item.kind === 'live') return true
  const published = item.publishedText?.toLocaleLowerCase('ja') ?? ''
  if (!published) return true
  if (/たった今|秒前|分前|時間前|just now|seconds? ago|minutes? ago|hours? ago/.test(published)) return true
  const days = published.match(/(\d+)\s*(?:日前|days? ago)/)?.[1]
  return days !== undefined && Number(days) <= 1
}

export function getYouTubeReadId(item: YouTubeNotificationItem) {
  return item.kind === 'live' && item.publishedText ? `${item.id}:${item.publishedText}` : item.id
}

export function hasLiveScheduleChanged(item: YouTubeNotificationItem, previousTime: string | undefined) {
  return item.kind === 'live' && item.isUpcoming && previousTime !== undefined && previousTime !== (item.publishedText ?? '')
}

export function useYouTubeNotifications(channels: string[], pushEnabled: boolean, apiKey: string, liveFilters: YouTubeLiveFilters) {
  const [items, setItems] = useState<YouTubeNotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const seenIds = useRef<Set<string> | null>(null)
  const notifiedIds = useRef(new Set(loadStringArray(NOTIFIED_STORAGE_KEY)))
  const liveSchedules = useRef(new Map(Object.entries(loadStringRecord(LIVE_SCHEDULE_STORAGE_KEY))))
  const activeChannelKey = useRef('')
  const pushEnabledRef = useRef(pushEnabled)

  useEffect(() => {
    pushEnabledRef.current = pushEnabled
  }, [pushEnabled])

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), [])

  useEffect(() => {
    if (!channels.length) {
      setItems([])
      setError('')
      setWarnings([])
      setLastUpdated(null)
      seenIds.current = null
      activeChannelKey.current = ''
      return
    }

    if (!apiKey.trim()) {
      setItems([])
      setLoading(false)
      setWarnings([])
      setLastUpdated(null)
      setError('YouTube Data APIキーを設定してください。')
      return
    }
    if (!isValidYouTubeApiKey(apiKey)) {
      setItems([])
      setLoading(false)
      setWarnings([])
      setLastUpdated(null)
      setError('YouTube Data APIキーの形式を確認してください。')
      return
    }

    let cancelled = false
    const channelKey = channels.join('|')
    if (activeChannelKey.current !== channelKey) {
      seenIds.current = null
      activeChannelKey.current = channelKey
    }

    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true)
      try {
        const data = await fetchYouTubeNotifications(channels, apiKey)
        data.notifications = data.notifications.filter((item) => !isHiddenYouTubeLive(item, liveFilters))
        if (!data.channels.length && data.warnings.length) throw new Error(data.warnings[0])
        if (cancelled || activeChannelKey.current !== channelKey) return

        const changedScheduleIds = new Set(
          data.notifications
            .filter((item) => hasLiveScheduleChanged(item, liveSchedules.current.get(item.id)))
            .map((item) => item.id),
        )
        const freshItems = seenIds.current
          ? data.notifications.filter((item) => !seenIds.current?.has(item.id))
          : []
        const existingLiveItems = data.notifications.filter(
          (item) => item.kind === 'live' && !notifiedIds.current.has(item.id),
        )
        const notificationItems = [...new Map(
          [...freshItems, ...existingLiveItems, ...data.notifications.filter((item) => changedScheduleIds.has(item.id))]
            .map((item) => [item.id, item]),
        ).values()]

        if (pushEnabledRef.current && 'Notification' in window && window.Notification.permission === 'granted') {
          const newlyNotified: string[] = []
          notificationItems.forEach((item) => {
            const scheduleChanged = changedScheduleIds.has(item.id)
            new window.Notification(
              scheduleChanged
                ? 'ライブ配信日時が変更されました'
                : item.kind === 'post'
                ? '新しいYouTube投稿'
                : item.isLive
                  ? 'ライブ配信が始まりました'
                  : 'ライブ配信枠が公開されました',
              {
                body: scheduleChanged
                  ? `${item.channelName} — ${item.title}\n変更後: ${item.publishedText ?? '日時未定'}`
                  : `${item.channelName} — ${item.title}`,
                icon: item.thumbnailUrl ?? undefined,
                tag: item.id,
              },
            )
            newlyNotified.push(item.id)
          })
          if (newlyNotified.length) {
            newlyNotified.forEach((id) => notifiedIds.current.add(id))
            localStorage.setItem(
              NOTIFIED_STORAGE_KEY,
              JSON.stringify([...notifiedIds.current].slice(-300)),
            )
          }
        }

        data.notifications
          .filter((item) => item.kind === 'live' && item.isUpcoming)
          .forEach((item) => liveSchedules.current.set(item.id, item.publishedText ?? ''))
        localStorage.setItem(
          LIVE_SCHEDULE_STORAGE_KEY,
          JSON.stringify(Object.fromEntries([...liveSchedules.current].slice(-300))),
        )
        seenIds.current = new Set(data.notifications.map((item) => item.id))
        setItems(data.notifications)
        setWarnings(data.warnings)
        setError('')
        setLastUpdated(new Date(data.fetchedAt))
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'YouTube通知を取得できませんでした。')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load(true)
    const timer = window.setInterval(() => void load(), 5 * 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [apiKey, channels, liveFilters, refreshVersion])

  return { items, loading, error, warnings, lastUpdated, refresh }
}
