import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type KirikomodoApi, type LookTarget } from '@shared/ipc'
import type { Settings } from '@shared/settings'

const api: KirikomodoApi = {
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  onSettingsChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, settings: Settings): void => listener(settings)
    ipcRenderer.on(IPC.settingsChanged, handler)
    return () => ipcRenderer.removeListener(IPC.settingsChanged, handler)
  },
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  openWindow: (name) => ipcRenderer.send(IPC.windowOpen, name),
  closeSelf: () => ipcRenderer.send(IPC.windowCloseSelf),
  setIgnoreMouse: (ignore) => ipcRenderer.send(IPC.windowIgnoreMouse, ignore),
  dragStart: () => ipcRenderer.send(IPC.windowDragStart),
  drag: (dx, dy) => ipcRenderer.send(IPC.windowDrag, { dx, dy }),
  showContextMenu: () => ipcRenderer.send(IPC.windowContextMenu),
  onCursorMoved: (listener) => {
    const handler = (_event: IpcRendererEvent, look: LookTarget): void => listener(look)
    ipcRenderer.on(IPC.cursorMoved, handler)
    return () => ipcRenderer.removeListener(IPC.cursorMoved, handler)
  },
  quitApp: () => ipcRenderer.send(IPC.appQuit)
}

contextBridge.exposeInMainWorld('kirikomodo', api)
