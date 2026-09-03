import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function handleSplatoonApi(request: IncomingMessage, response: ServerResponse): Promise<boolean>
export function splatoonApiPlugin(): Plugin
