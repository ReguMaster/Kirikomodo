import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type KirikomodoApi } from '@shared/ipc'
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
  quitApp: () => ipcRenderer.send(IPC.appQuit)
}

contextBridge.exposeInMainWorld('kirikomodo', api)
