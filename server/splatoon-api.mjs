const CACHE_TTL_MS = 45_000
const DATA_URL = 'https://splatoon3.ink/data/schedules.json'
const LOCALE_URL = 'https://splatoon3.ink/data/locale/ja-JP.json'
const ASSET_URL = 'https://raw.githubusercontent.com/misenhower/splatoon3.ink/main/src/assets/img'
const RULE_IMAGES = {
  TURF_WAR: `${ASSET_URL}/rules/regular.svg`,
  AREA: `${ASSET_URL}/rules/area.svg`,
  LOFT: `${ASSET_URL}/rules/yagura.svg`,
  GOAL: `${ASSET_URL}/rules/hoko.svg`,
  CLAM: `${ASSET_URL}/rules/asari.svg`,
}
const BOSS_IMAGES = {
  Cohozuna: `${ASSET_URL}/king-cohozuna.png`,
  Horrorboros: `${ASSET_URL}/king-horrorboros.png`,
  Megalodontia: `${ASSET_URL}/king-megalodontia.png`,
  Triumvirate: `${ASSET_URL}/king-triumvirate.png`,
}
let cache = null

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`splatoon3.inkから取得できませんでした（${response.status}）`)
  return response.json()
}

function currentNode(nodes) {
  const now = Date.now()
  return nodes?.find((node) => Date.parse(node.startTime) <= now && now < Date.parse(node.endTime)) ?? nodes?.[0] ?? null
}

function stages(setting, locale) {
  return (setting?.vsStages ?? []).map((stage) => ({
    id: stage.id,
    name: locale.stages?.[stage.id]?.name ?? stage.name,
    imageUrl: stage.image?.url ?? null,
  }))
}

function battleItem(key, mode, node, setting, locale) {
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

async function loadStages() {
  if (cache && cache.expiresAt > Date.now()) return cache.promise
  const promise = (async () => {
    const [scheduleResponse, locale] = await Promise.all([fetchJson(DATA_URL), fetchJson(LOCALE_URL)])
    const data = scheduleResponse.data
    const regular = currentNode(data.regularSchedules?.nodes)
    const bankara = currentNode(data.bankaraSchedules?.nodes)
    const xBattle = currentNode(data.xSchedules?.nodes)
    const coop = currentNode(data.coopGroupingSchedule?.regularSchedules?.nodes)
    const regularSetting = regular?.regularMatchSetting ?? regular?.festMatchSettings?.[0]
    const items = [
      battleItem('regular', 'レギュラーマッチ', regular, regularSetting, locale),
      ...((bankara?.bankaraMatchSettings ?? []).map((setting) => battleItem(
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
        weapons: (coop.setting.weapons ?? []).map((weapon) => ({
          name: locale.weapons?.[weapon.__splatoon3ink_id]?.name ?? weapon.name,
          imageUrl: weapon.image?.url ?? null,
        })),
        startTime: coop.startTime,
        endTime: coop.endTime,
        url: 'https://splatoon3.ink/salmonrun',
      } : null,
    ].filter(Boolean)
    return { fetchedAt: new Date().toISOString(), items }
  })()
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, promise }
  promise.catch(() => { cache = null })
  return promise
}

export async function handleSplatoonApi(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname !== '/api/splatoon/stages') return false
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    json(response, 405, { error: 'GETメソッドを使用してください。' })
    return true
  }
  try {
    json(response, 200, await loadStages())
  } catch (error) {
    json(response, 502, { error: error instanceof Error ? error.message : 'ステージ情報を取得できませんでした。' })
  }
  return true
}

export function splatoonApiPlugin() {
  const configure = (server) => {
    server.middlewares.use(async (request, response, next) => {
      try {
        if (!(await handleSplatoonApi(request, response))) next()
      } catch (error) {
        next(error)
      }
    })
  }
  return { name: 'roxy-splatoon-api', configureServer: configure, configurePreviewServer: configure }
}
