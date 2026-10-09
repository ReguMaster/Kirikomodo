import { BrowserWindow, app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC, type AppInfo } from '@shared/ipc'
import { SettingsPatchSchema } from '@shared/settings'
import { CHAT_MAX_INPUT_LENGTH } from '@shared/types'
import { getSettings, onSettingsChanged, updateSettings } from '../services/settings'
import { clearChat, getChatHistory, sendChat, speakProactive } from '../services/dialogue'
import { log } from '../services/logger'
import { beginCharacterDrag, dragCharacter, getCharacterWindow, setCharacterIgnoreMouse } from '../windows/character'
import { buildAppMenu } from '../tray'
import { openChatWindow } from '../windows/chat'
import { openSettingsWindow } from '../windows/settings'

const OpenWindowSchema = z.enum(['chat', 'settings'])
const DragSchema = z.object({ dx: z.number().finite(), dy: z.number().finite() })
const ChatTextSchema = z.string().trim().min(1).max(CHAT_MAX_INPUT_LENGTH)

// 앱이 만든 BrowserWindow에서 온 메시지만 받는다 (IPC sender 검증, 명세 9절).
function isTrusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return false
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl))
}

function isFromCharacter(event: IpcMainEvent): boolean {
  const win = getCharacterWindow()
  return !!win && BrowserWindow.fromWebContents(event.sender) === win
}

function handle<T>(channel: string, schema: z.ZodType<T> | null, fn: (event: IpcMainInvokeEvent, arg: T) => unknown): void {
  ipcMain.handle(channel, (event, raw) => {
    if (!isTrusted(event)) throw new Error(`untrusted sender for ${channel}`)
    const arg = schema ? schema.parse(raw) : (undefined as T)
    return fn(event, arg)
  })
}

function on<T>(channel: string, schema: z.ZodType<T> | null, fn: (event: IpcMainEvent, arg: T) => void): void {
  ipcMain.on(channel, (event, raw) => {
    if (!isTrusted(event)) return
    if (!schema) {
      fn(event, undefined as T)
      return
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      log.warn('ipc', `rejected ${channel}`, parsed.error.issues)
      return
    }
    fn(event, parsed.data)
  })
}

export function registerIpc(): void {
  handle(IPC.settingsGet, null, () => getSettings())
  handle(IPC.settingsUpdate, SettingsPatchSchema, (_event, patch) => updateSettings(patch))
  handle(
    IPC.appInfo,
    null,
    (): AppInfo => ({
      name: 'Kirikomodo',
      version: app.getVersion(),
      platform: process.platform,
      userDataPath: app.getPath('userData')
    })
  )

  on(IPC.windowOpen, OpenWindowSchema, (_event, name) => {
    if (name === 'chat') openChatWindow()
    else openSettingsWindow()
  })
  on(IPC.windowCloseSelf, null, (event) => BrowserWindow.fromWebContents(event.sender)?.close())
  on(IPC.windowIgnoreMouse, z.boolean(), (event, ignore) => {
    if (isFromCharacter(event)) setCharacterIgnoreMouse(ignore)
  })
  on(IPC.windowDragStart, null, (event) => {
    if (isFromCharacter(event)) beginCharacterDrag()
  })
  on(IPC.windowDrag, DragSchema, (event, { dx, dy }) => {
    if (isFromCharacter(event)) dragCharacter(dx, dy)
  })
  on(IPC.windowContextMenu, null, (event) => {
    const win = getCharacterWindow()
    if (win && isFromCharacter(event)) buildAppMenu().popup({ window: win })
  })
  handle(IPC.chatSend, ChatTextSchema, (_event, text) => sendChat(text))
  handle(IPC.chatHistory, null, () => getChatHistory())
  handle(IPC.chatClear, null, () => clearChat())
  on(IPC.chatProactive, null, (event) => {
    if (isFromCharacter(event)) speakProactive()
  })
  on(IPC.appQuit, null, () => app.quit())

  onSettingsChanged((settings) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.settingsChanged, settings)
    }
  })
}
