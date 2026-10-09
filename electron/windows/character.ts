import { BrowserWindow } from 'electron'
import type { Settings } from '@shared/settings'
import { SECURE_WEB_PREFERENCES, loadRenderer } from './load'

export const CHARACTER_BASE_SIZE = { width: 320, height: 400 } as const

let win: BrowserWindow | null = null

export function getCharacterWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

export function createCharacterWindow(settings: Settings): BrowserWindow {
  const existing = getCharacterWindow()
  if (existing) return existing

  const width = Math.round(CHARACTER_BASE_SIZE.width * settings.window.scale)
  const height = Math.round(CHARACTER_BASE_SIZE.height * settings.window.scale)
  const position = settings.window.x !== null && settings.window.y !== null ? { x: settings.window.x, y: settings.window.y } : {}

  win = new BrowserWindow({
    title: 'Kirikomodo',
    width,
    height,
    ...position,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: settings.window.alwaysOnTop,
    show: false,
    webPreferences: SECURE_WEB_PREFERENCES
  })
  win.setMenu(null)
  win.setOpacity(settings.window.opacity)
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  loadRenderer(win, 'character')
  return win
}
