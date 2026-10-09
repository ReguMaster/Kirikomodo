import { BrowserWindow } from 'electron'
import { SECURE_WEB_PREFERENCES, loadRenderer } from './load'

let win: BrowserWindow | null = null

export function getChatWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

export function openChatWindow(): BrowserWindow {
  const existing = getChatWindow()
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }
  win = new BrowserWindow({
    title: 'Kirikomodo',
    width: 380,
    height: 520,
    minWidth: 320,
    minHeight: 400,
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
  loadRenderer(win, 'chat')
  return win
}
