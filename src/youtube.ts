import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from './api'

export type YouTubeNotificationItem = {
  id: string
  kind: 'live' | 'post'
  channelId: string
  channelName: string
  avatarUrl: string | null
  title: string
  body: string
  url: string
  thumbnailUrl: string | null
  publishedText: string | null
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
const EXCLUDED_WORD_STORAGE_KEY = 'roxy-notice:youtube-excluded-words'
const READ_STORAGE_KEY = 'roxy-notice:youtube-read-items'
const NOTIFIED_STORAGE_KEY = 'roxy-notice:youtube-notified-items'
const LIVE_SCHEDULE_STORAGE_KEY = 'roxy-notice:youtube-live-schedules'

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

export function loadYouTubeExcludedWords() {
  return loadStringArray(EXCLUDED_WORD_STORAGE_KEY)
}

export function saveYouTubeExcludedWords(words: string[]) {
  localStorage.setItem(EXCLUDED_WORD_STORAGE_KEY, JSON.stringify(words))
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

export function isExcludedLiveItem(item: YouTubeNotificationItem, words: string[]) {
  if (item.kind !== 'live') return false
  const title = item.title.toLocaleLowerCase('ja')
  return words.some((word) => {
    const normalized = word.trim().toLocaleLowerCase('ja')
    return normalized.length > 0 && title.includes(normalized)
  })
}

export function getYouTubeReadId(item: YouTubeNotificationItem) {
  return item.kind === 'live' && item.publishedText ? `${item.id}:${item.publishedText}` : item.id
}

export function hasLiveScheduleChanged(item: YouTubeNotificationItem, previousTime: string | undefined) {
  return item.kind === 'live' && item.isUpcoming && previousTime !== undefined && previousTime !== (item.publishedText ?? '')
}

export function useYouTubeNotifications(channels: string[], pushEnabled: boolean, excludedWords: string[]) {
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

    let cancelled = false
    const channelKey = channels.join('|')
    if (activeChannelKey.current !== channelKey) {
      seenIds.current = null
      activeChannelKey.current = channelKey
    }

    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true)
      try {
        const params = new URLSearchParams({ channels: channels.join(',') })
        const response = await fetch(apiUrl(`/api/youtube/notifications?${params}`), { headers: { Accept: 'application/json' } })
        const data = await response.json() as YouTubeApiResponse
        if (!response.ok) throw new Error(data.error || `YouTubeから取得できませんでした（${response.status}）`)
        if (cancelled || activeChannelKey.current !== channelKey) return

        const eligibleItems = data.notifications.filter((item) => !isExcludedLiveItem(item, excludedWords))
        const changedScheduleIds = new Set(
          eligibleItems
            .filter((item) => hasLiveScheduleChanged(item, liveSchedules.current.get(item.id)))
            .map((item) => item.id),
        )
        const freshItems = seenIds.current
          ? eligibleItems.filter((item) => !seenIds.current?.has(item.id))
          : []
        const existingLiveItems = eligibleItems.filter(
          (item) => item.kind === 'live' && !notifiedIds.current.has(item.id),
        )
        const notificationItems = [...new Map(
          [...freshItems, ...existingLiveItems, ...eligibleItems.filter((item) => changedScheduleIds.has(item.id))]
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
    const timer = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [channels, excludedWords, refreshVersion])

  return { items: items.filter((item) => !isExcludedLiveItem(item, excludedWords)), loading, error, warnings, lastUpdated, refresh }
}
