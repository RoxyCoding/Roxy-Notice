import { mkdir, writeFile } from 'node:fs/promises'
import { handleAsmrApi } from '../server/asmr-api.mjs'
import { handleSplatoonApi } from '../server/splatoon-api.mjs'

class CaptureResponse {
  constructor() {
    this.status = 200
    this.body = ''
  }

  setHeader() {}

  writeHead(status) {
    this.status = status
  }

  end(body = '') {
    this.body = String(body)
  }
}

async function capture(handler, pathname) {
  const response = new CaptureResponse()
  await handler({ method: 'GET', url: pathname }, response)
  if (response.status >= 400) throw new Error(`HTTP ${response.status}`)
  return JSON.parse(response.body)
}

async function safelyGenerate(name, handler, pathname, fallback) {
  try {
    return await capture(handler, pathname)
  } catch (error) {
    return {
      ...fallback,
      fetchedAt: new Date().toISOString(),
      warnings: [`${name}の更新に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`],
    }
  }
}

const [asmr, splatoon] = await Promise.all([
  safelyGenerate('ASMR', handleAsmrApi, '/api/asmr/notifications', {
    sources: [],
    notifications: [],
    warnings: [],
  }),
  safelyGenerate('Splatoon', handleSplatoonApi, '/api/splatoon/stages', {
    items: [],
    warnings: [],
  }),
])

await mkdir('public/data', { recursive: true })
await Promise.all([
  writeFile('public/data/asmr.json', `${JSON.stringify(asmr)}\n`, 'utf8'),
  writeFile('public/data/splatoon.json', `${JSON.stringify(splatoon)}\n`, 'utf8'),
])

console.log(`Static data generated: ASMR ${asmr.notifications.length}, Splatoon ${splatoon.items.length}`)
