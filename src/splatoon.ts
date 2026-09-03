import { useCallback, useEffect, useRef, useState } from 'react'

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

const DATA_URL = 'https://splatoon3.ink/data/schedules.json'
const LOCALE_URL = 'https://splatoon3.ink/data/locale/ja-JP.json'
const ASSET_URL = 'https://raw.githubusercontent.com/misenhower/splatoon3.ink/main/src/assets/img'
const RULE_IMAGES: Record<string, string> = {
  TURF_WAR: `${ASSET_URL}/rules/regular.svg`,
  AREA: `${ASSET_URL}/rules/area.svg`,
  LOFT: `${ASSET_URL}/rules/yagura.svg`,
  GOAL: `${ASSET_URL}/rules/hoko.svg`,
  CLAM: `${ASSET_URL}/rules/asari.svg`,
}
const BOSS_IMAGES: Record<string, string> = {
  Cohozuna: `${ASSET_URL}/king-cohozuna.png`,
  Horrorboros: `${ASSET_URL}/king-horrorboros.png`,
  Megalodontia: `${ASSET_URL}/king-megalodontia.png`,
  Triumvirate: `${ASSET_URL}/king-triumvirate.png`,
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(`${url}?v=${Date.now()}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!response.ok) throw new Error(`splatoon3.inkから取得できませんでした（${response.status}）`)
  return response.json()
}

function currentNode(nodes: any[]) {
  const now = Date.now()
  return nodes?.find((node) => Date.parse(node.startTime) <= now && now < Date.parse(node.endTime)) ?? nodes?.[0] ?? null
}

function stages(setting: any, locale: any) {
  return (setting?.vsStages ?? []).map((stage: any) => ({
    id: stage.id,
    name: locale.stages?.[stage.id]?.name ?? stage.name,
    imageUrl: stage.image?.url ?? null,
  }))
}

function battleItem(key: string, mode: string, node: any, setting: any, locale: any): SplatoonStageItem | null {
  if (!node || !setting) return null
  return {
    id: `splatoon:${key}:${node.startTime}`,
    mode,
    rule: locale.rules?.[setting.vsRule?.id]?.name ?? setting.vsRule?.name ?? '',
    ruleImageUrl: RULE_IMAGES[setting.vsRule?.rule] ?? null,
    stages: stages(setting, locale),
    startTime: node.startTime,
    endTime: node.endTime,
    url: 'https://splatoon3.ink/',
  }
}

async function loadCurrentStages(): Promise<SplatoonApiResponse> {
  const [scheduleResponse, locale] = await Promise.all([fetchJson(DATA_URL), fetchJson(LOCALE_URL)])
  const data = scheduleResponse.data
  const regular = currentNode(data.regularSchedules?.nodes)
  const bankara = currentNode(data.bankaraSchedules?.nodes)
  const xBattle = currentNode(data.xSchedules?.nodes)
  const coop = currentNode(data.coopGroupingSchedule?.regularSchedules?.nodes)
  const regularSetting = regular?.regularMatchSetting ?? regular?.festMatchSettings?.[0]
  const items: SplatoonStageItem[] = [
    battleItem('regular', 'レギュラーマッチ', regular, regularSetting, locale),
    ...((bankara?.bankaraMatchSettings ?? []).map((setting: any) => battleItem(
      `bankara-${setting.bankaraMode?.toLowerCase()}`,
      setting.bankaraMode === 'CHALLENGE' ? 'バンカラマッチ（チャレンジ）' : 'バンカラマッチ（オープン）',
      bankara,
      setting,
      locale,
    ))),
    battleItem('x', 'Xマッチ', xBattle, xBattle?.xMatchSetting, locale),
    coop?.setting ? {
      id: `splatoon:salmon:${coop.startTime}`,
      mode: 'サーモンラン',
      rule: 'サーモンラン',
      ruleImageUrl: `${ASSET_URL}/modes/coop.svg`,
      stages: [{
        id: coop.setting.coopStage.id,
        name: locale.stages?.[coop.setting.coopStage.id]?.name ?? coop.setting.coopStage.name,
        imageUrl: coop.setting.coopStage.image?.url ?? coop.setting.coopStage.thumbnailImage?.url ?? null,
      }],
      boss: coop.setting.boss ? {
        name: locale.bosses?.[coop.setting.boss.id]?.name ?? coop.setting.boss.name,
        imageUrl: BOSS_IMAGES[coop.setting.boss.name] ?? null,
      } : null,
      weapons: (coop.setting.weapons ?? []).map((weapon: any) => ({
        name: locale.weapons?.[weapon.__splatoon3ink_id]?.name ?? weapon.name,
        imageUrl: weapon.image?.url ?? null,
      })),
      startTime: coop.startTime,
      endTime: coop.endTime,
      url: 'https://splatoon3.ink/salmonrun',
    } : null,
  ].filter((item): item is SplatoonStageItem => item !== null)
  return { fetchedAt: new Date().toISOString(), items }
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
        const data = await loadCurrentStages()
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
