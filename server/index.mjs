import { createReadStream } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleYouTubeApi } from './youtube-api.mjs'
import { handleXApi } from './x-api.mjs'
import { handleAsmrApi } from './asmr-api.mjs'
import { handleSplatoonApi } from './splatoon-api.mjs'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const distributionDirectory = await realpath(path.resolve(serverDirectory, '..', 'dist'))
const port = Number(process.env.PORT) || 4174
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

async function resolveStaticFile(pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const candidate = path.resolve(distributionDirectory, `.${decodeURIComponent(requestedPath)}`)
  const relative = path.relative(distributionDirectory, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null

  try {
    await access(candidate)
    const details = await stat(candidate)
    if (details.isFile()) return candidate
  } catch {
    // SPA routes fall through to index.html.
  }
  return path.join(distributionDirectory, 'index.html')
}

const server = createServer(async (request, response) => {
  try {
    const requestOrigin = request.headers.origin
    const allowedOrigin = allowedOrigins.includes('*')
      ? '*'
      : allowedOrigins.includes(requestOrigin ?? '')
        ? requestOrigin
        : null
    if (allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin)
      response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      if (allowedOrigin !== '*') response.setHeader('Vary', 'Origin')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    if (await handleYouTubeApi(request, response)) return
    if (await handleXApi(request, response)) return
    if (await handleAsmrApi(request, response)) return
    if (await handleSplatoonApi(request, response)) return
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }

    const url = new URL(request.url ?? '/', 'http://localhost')
    const filePath = await resolveStaticFile(url.pathname)
    if (!filePath) {
      response.writeHead(403)
      response.end()
      return
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(filePath).pipe(response)
  } catch (error) {
    console.error(error)
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: 'サーバーでエラーが発生しました。' }))
  }
})

server.listen(port, () => {
  console.log(`Roxy Notice: http://localhost:${port}`)
})
