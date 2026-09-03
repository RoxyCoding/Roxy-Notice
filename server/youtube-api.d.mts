import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function handleYouTubeApi(request: IncomingMessage, response: ServerResponse): Promise<boolean>
export function youtubeApiPlugin(): Plugin
