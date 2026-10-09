import type { Settings, SettingsPatch } from './settings'

export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',
  windowOpen: 'window:open',
  windowCloseSelf: 'window:close-self',
  windowIgnoreMouse: 'window:ignore-mouse',
  appQuit: 'app:quit',
  appInfo: 'app:info'
} as const

export type WindowName = 'character' | 'chat' | 'settings'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  userDataPath: string
}

// preload가 contextBridge로 노출하는 API. Renderer는 이것만 사용한다.
export interface KirikomodoApi {
  getSettings(): Promise<Settings>
  updateSettings(patch: SettingsPatch): Promise<Settings>
  onSettingsChanged(listener: (settings: Settings) => void): () => void
  getAppInfo(): Promise<AppInfo>
  openWindow(name: Exclude<WindowName, 'character'>): void
  closeSelf(): void
  /** 캐릭터 창 전용. 투명 영역 위에서는 true로 보내 하위 창 클릭을 통과시킨다. */
  setIgnoreMouse(ignore: boolean): void
  quitApp(): void
}
