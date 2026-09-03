import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function handleXApi(request: IncomingMessage, response: ServerResponse): Promise<boolean>
export function xApiPlugin(): Plugin
