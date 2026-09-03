import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from './api'

export type XNotificationItem = {
  id: string
  userHandle: string
  authorHandle: string
  authorName: string
  avatarUrl: string | null
  text: string
  url: string
  createdAt: string
  thumbnailUrl: string | null
  isReply: boolean
}

type XApiResponse = {
  fetchedAt: string
  users: Array<{ handle: string; displayName: string; avatarUrl: string | null }>
  notifications: XNotificationItem[]
  warnings: string[]
  error?: string
}

const USER_STORAGE_KEY = 'roxy-notice:x-users'
const READ_STORAGE_KEY = 'roxy-notice:x-read-items'
const NOTIFIED_STORAGE_KEY = 'roxy-notice:x-notified-items'
const TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function loadStringArray(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function normalizeXUser(value: string) {
  let handle = value.trim()
  try {
    const url = new URL(handle)
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLocaleLowerCase('en'))) return null
    handle = url.pathname.split('/').filter(Boolean)[0] ?? ''
  } catch {
    handle = handle.replace(/^@/, '')
  }
  return /^[A-Za-z0-9_]{2,15}$/.test(handle) ? handle : null
}

export function loadXUsers() {
  return loadStringArray(USER_STORAGE_KEY)
}

export function saveXUsers(users: string[]) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users))
}

export function loadReadXItems() {
  return loadStringArray(READ_STORAGE_KEY)
}

export function saveReadXItems(ids: string[]) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids.slice(-300)))
}

export function formatXTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '新着' : TIME_FORMATTER.format(date)
}

export function isRecentXItem(item: XNotificationItem) {
  const createdAt = Date.parse(item.createdAt)
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 24 * 60 * 60 * 1000
}

export function useXNotifications(users: string[], pushEnabled: boolean) {
  const [items, setItems] = useState<XNotificationItem[]>([])
  const [profiles, setProfiles] = useState<XApiResponse['users']>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const seenIds = useRef<Set<string> | null>(null)
  const notifiedIds = useRef(new Set(loadStringArray(NOTIFIED_STORAGE_KEY)))
  const activeUserKey = useRef('')
  const pushEnabledRef = useRef(pushEnabled)

  useEffect(() => {
    pushEnabledRef.current = pushEnabled
  }, [pushEnabled])

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), [])

  useEffect(() => {
    if (!users.length) {
      setItems([])
      setProfiles([])
      setError('')
      setWarnings([])
      setLastUpdated(null)
      seenIds.current = null
      activeUserKey.current = ''
      return
    }

    let cancelled = false
    const userKey = users.join('|')
    if (activeUserKey.current !== userKey) {
      seenIds.current = null
      activeUserKey.current = userKey
    }

    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true)
      try {
        const params = new URLSearchParams({ users: users.join(',') })
        const response = await fetch(apiUrl(`/api/x/notifications?${params}`), { headers: { Accept: 'application/json' } })
        const responseText = await response.text()
        if (!responseText.trim()) throw new Error(`X取得APIから応答がありません（${response.status}）。サーバーを再起動してください。`)
        let data: XApiResponse
        try {
          data = JSON.parse(responseText) as XApiResponse
        } catch {
          throw new Error('X取得APIの応答を読み取れませんでした。サーバーを再起動してください。')
        }
        if (!response.ok) throw new Error(data.error || `Xから取得できませんでした（${response.status}）`)
        if (cancelled || activeUserKey.current !== userKey) return

        const freshItems = seenIds.current
          ? data.notifications.filter((item) => !seenIds.current?.has(item.id) && !notifiedIds.current.has(item.id))
          : []

        if (pushEnabledRef.current && 'Notification' in window && window.Notification.permission === 'granted') {
          freshItems.forEach((item) => {
            new window.Notification('新しいX投稿', {
              body: `${item.authorName} (@${item.authorHandle})\n${item.text.slice(0, 180)}`,
              icon: item.avatarUrl ?? undefined,
              tag: item.id,
            })
            notifiedIds.current.add(item.id)
          })
          if (freshItems.length) {
            localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify([...notifiedIds.current].slice(-300)))
          }
        }

        seenIds.current = new Set(data.notifications.map((item) => item.id))
        setItems(data.notifications)
        setProfiles(data.users)
        setWarnings(data.warnings)
        setError('')
        setLastUpdated(new Date(data.fetchedAt))
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'X通知を取得できませんでした。')
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
  }, [refreshVersion, users])

  return { items, profiles, loading, error, warnings, lastUpdated, refresh }
}
