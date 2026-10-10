/// <reference types="vite/client" />
import type { KirikomodoApi } from '@shared/ipc'

declare global {
  interface Window {
    kirikomodo: KirikomodoApi
  }
}

export {}
