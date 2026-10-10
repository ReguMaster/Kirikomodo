import { BrowserWindow } from 'electron'
import { APP_ICON_PATH, SECURE_WEB_PREFERENCES, loadRenderer } from './load'

let win: BrowserWindow | null = null

export function getSettingsWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

export function openSettingsWindow(): BrowserWindow {
  const existing = getSettingsWindow()
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }
  win = new BrowserWindow({
    title: 'Kirikomodo 설정',
    icon: APP_ICON_PATH,
    width: 560,
    height: 640,
    minWidth: 480,
    minHeight: 480,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: SECURE_WEB_PREFERENCES
  })
  win.setMenu(null)
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  loadRenderer(win, 'settings')
  return win
}
