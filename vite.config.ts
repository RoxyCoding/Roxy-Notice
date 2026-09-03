import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { youtubeApiPlugin } from './server/youtube-api.mjs'
import { xApiPlugin } from './server/x-api.mjs'
import { asmrApiPlugin } from './server/asmr-api.mjs'
import { splatoonApiPlugin } from './server/splatoon-api.mjs'

export default defineConfig({
  plugins: [react(), youtubeApiPlugin(), xApiPlugin(), asmrApiPlugin(), splatoonApiPlugin()],
  base: './',
})
