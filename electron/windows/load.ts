import { join } from 'node:path'
import { app, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import type { WindowName } from '@shared/ipc'

export const PRELOAD_PATH = join(__dirname, '../preload/preload.js')

// resources/는 asar에 포함되므로 개발·패키징 모두 app path 기준으로 찾는다.
export const APP_RESOURCE = (file: string): string => join(app.getAppPath(), 'resources', file)
export const APP_ICON_PATH = APP_RESOURCE('icon.png')

export const SECURE_WEB_PREFERENCES: BrowserWindowConstructorOptions['webPreferences'] = {
  preload: PRELOAD_PATH,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false
}

export function loadRenderer(win: BrowserWindow, page: WindowName): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) {
    void win.loadURL(`${devUrl}/${page}/index.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
  }
}
