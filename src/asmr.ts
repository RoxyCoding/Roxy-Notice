import { useCallback, useEffect, useRef, useState } from 'react'
import { staticDataUrl } from './api'

export type AsmrNotificationItem = {
  id: string
  source: string
  title: string
  url: string
  author: string
  publishedAt: string | null
  thumbnailUrl: string | null
  dlsiteUrl: string | null
  maker: string | null
  price: number | null
  voice: string[]
  scenario: string[]
  illust: string[]
}

type AsmrApiResponse = {
  fetchedAt: string
  sources: Array<{ name: string; label: string }>
  notifications: AsmrNotificationItem[]
  warnings: string[]
  error?: string
}

const READ_STORAGE_KEY = 'roxy-notice:asmr-read-items'
const NOTIFIED_STORAGE_KEY = 'roxy-notice:asmr-notified-items'
const VOICE_FILTER_STORAGE_KEY = 'roxy-notice:asmr-voice-filters'
const TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function loadStringArray(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function loadReadAsmrItems() {
  return loadStringArray(READ_STORAGE_KEY)
}

export function saveReadAsmrItems(ids: string[]) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids.slice(-300)))
}

export function loadAsmrVoiceFilters() {
  return loadStringArray(VOICE_FILTER_STORAGE_KEY)
}

export function saveAsmrVoiceFilters(voices: string[]) {
  localStorage.setItem(VOICE_FILTER_STORAGE_KEY, JSON.stringify(voices))
}

function matchesVoiceFilter(item: AsmrNotificationItem, voiceFilters: string[]) {
  const filters = voiceFilters.map((voice) => voice.trim().toLocaleLowerCase('ja')).filter(Boolean)
  return filters.length > 0 && item.voice.some((voice) => {
    const normalizedVoice = voice.trim().toLocaleLowerCase('ja')
    return filters.some((filter) => normalizedVoice.includes(filter))
  })
}

export function formatAsmrTime(value: string | null) {
  if (!value) return '日時不明'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '日時不明' : TIME_FORMATTER.format(date)
}

export function isRecentAsmrItem(item: AsmrNotificationItem) {
  const publishedAt = Date.parse(item.publishedAt ?? '')
  return Number.isFinite(publishedAt) && Date.now() - publishedAt <= 24 * 60 * 60 * 1000
}

export function useAsmrNotifications(pushEnabled: boolean, voiceFilters: string[]) {
  const [items, setItems] = useState<AsmrNotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const seenIds = useRef<Set<string> | null>(null)
  const notifiedIds = useRef(new Set(loadStringArray(NOTIFIED_STORAGE_KEY)))
  const pushEnabledRef = useRef(pushEnabled)

  useEffect(() => { pushEnabledRef.current = pushEnabled }, [pushEnabled])
  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true)
      try {
        const response = await fetch(staticDataUrl('asmr.json'), { headers: { Accept: 'application/json' } })
        const responseText = await response.text()
        if (!responseText.trim()) throw new Error(`ASMR静的データが空です（${response.status}）。`)
        let data: AsmrApiResponse
        try {
          data = JSON.parse(responseText) as AsmrApiResponse
        } catch {
          throw new Error('ASMR静的データを読み取れませんでした。次回の自動更新をお待ちください。')
        }
        if (!response.ok) throw new Error(data.error || `ASMR作品を取得できませんでした（${response.status}）`)
        if (!data.notifications.length && data.warnings.length === data.sources.length) throw new Error(data.warnings[0] || 'ASMR作品を取得できませんでした。')
        if (cancelled) return

        const freshItems = seenIds.current ? data.notifications.filter((item) => !seenIds.current?.has(item.id) && !notifiedIds.current.has(item.id) && matchesVoiceFilter(item, voiceFilters)) : []
        if (pushEnabledRef.current && 'Notification' in window && window.Notification.permission === 'granted') {
          freshItems.forEach((item) => new window.Notification('新しいASMR作品', { body: `${item.author} — ${item.title}`, icon: item.thumbnailUrl ?? undefined, tag: item.id }))
          freshItems.forEach((item) => notifiedIds.current.add(item.id))
          if (freshItems.length) localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify([...notifiedIds.current].slice(-300)))
        }

        seenIds.current = new Set(data.notifications.map((item) => item.id))
        setItems(data.notifications)
        setWarnings(data.warnings)
        setError('')
        setLastUpdated(new Date(data.fetchedAt))
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'ASMR通知を取得できませんでした。')
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
  }, [refreshVersion, voiceFilters])

  return { items, loading, error, warnings, lastUpdated, refresh }
}
