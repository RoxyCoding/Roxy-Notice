import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from './api'

export type SplatoonStageItem = {
  id: string
  mode: string
  rule: string
  ruleImageUrl: string | null
  stages: Array<{ id: string; name: string; imageUrl: string | null }>
  boss?: { name: string; imageUrl: string | null } | null
  weapons?: Array<{ name: string; imageUrl: string | null }>
  startTime: string
  endTime: string
  url: string
}

type SplatoonApiResponse = {
  fetchedAt: string
  items: SplatoonStageItem[]
  error?: string
}

const READ_STORAGE_KEY = 'roxy-notice:splatoon-read-items'
const NOTIFIED_STORAGE_KEY = 'roxy-notice:splatoon-notified-items'
const TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })

function loadStringArray(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function loadReadSplatoonItems() {
  return loadStringArray(READ_STORAGE_KEY)
}

export function saveReadSplatoonItems(ids: string[]) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids.slice(-100)))
}

export function getSplatoonReadId(items: SplatoonStageItem[]) {
  return `splatoon:rotation:${items.map((item) => item.id).join(',')}`
}

export function formatSplatoonEnd(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '終了時刻不明' : `${TIME_FORMATTER.format(date)}まで`
}

export function useSplatoonStages(pushEnabled: boolean) {
  const [items, setItems] = useState<SplatoonStageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
        const response = await fetch(apiUrl('/api/splatoon/stages'), { headers: { Accept: 'application/json' } })
        const responseText = await response.text()
        if (!responseText.trim()) throw new Error(`ステージ取得APIから応答がありません（${response.status}）。サーバーを再起動してください。`)
        let data: SplatoonApiResponse
        try {
          data = JSON.parse(responseText) as SplatoonApiResponse
        } catch {
          throw new Error('ステージ取得APIの応答を読み取れませんでした。サーバーを再起動してください。')
        }
        if (!response.ok) throw new Error(data.error || `ステージ情報を取得できませんでした（${response.status}）`)
        if (cancelled) return

        const freshItems = seenIds.current ? data.items.filter((item) => !seenIds.current?.has(item.id) && !notifiedIds.current.has(item.id)) : []
        if (pushEnabledRef.current && 'Notification' in window && window.Notification.permission === 'granted') {
          if (freshItems.length) new window.Notification('ステージが切り替わりました', {
            body: freshItems.map((item) => `${item.mode}: ${item.stages.map((stage) => stage.name).join(' / ')}`).join('\n'),
            icon: freshItems[0]?.stages[0]?.imageUrl ?? undefined,
            tag: 'splatoon-stage-rotation',
          })
          freshItems.forEach((item) => notifiedIds.current.add(item.id))
          if (freshItems.length) localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify([...notifiedIds.current].slice(-100)))
        }

        seenIds.current = new Set(data.items.map((item) => item.id))
        setItems(data.items)
        setError('')
        setLastUpdated(new Date(data.fetchedAt))
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'ステージ情報を取得できませんでした。')
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
  }, [refreshVersion])

  return { items, loading, error, lastUpdated, refresh }
}
