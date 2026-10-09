import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: 'electron/main.ts' } },
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: 'electron/preload.ts' } },
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    root: 'src',
    plugins: [react()],
    resolve: { alias: { '@shared': shared, '@': resolve(__dirname, 'src') } },
    build: {
      rollupOptions: {
        input: {
          character: resolve(__dirname, 'src/character/index.html'),
          chat: resolve(__dirname, 'src/chat/index.html'),
          settings: resolve(__dirname, 'src/settings/index.html')
        }
      }
    }
  }
})
