import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { getCharacterWindow } from './character'
import { APP_ICON_PATH, SECURE_WEB_PREFERENCES, loadRenderer } from './load'

let win: BrowserWindow | null = null

export function getChatWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

// 채팅창에 포커스가 있는 동안 캐릭터 창의 행동 엔진은 CHATTING 상태로 자율 발화를 멈춘다.
function notifyChatFocus(focused: boolean): void {
  getCharacterWindow()?.webContents.send(IPC.chatWindowState, focused)
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
    icon: APP_ICON_PATH,
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
  win.on('focus', () => notifyChatFocus(true))
  win.on('blur', () => notifyChatFocus(false))
  win.on('closed', () => {
    win = null
    notifyChatFocus(false)
  })
  loadRenderer(win, 'chat')
  return win
}
