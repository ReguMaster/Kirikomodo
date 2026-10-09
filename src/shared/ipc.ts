import type { Settings, SettingsPatch } from './settings'

export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',
  windowOpen: 'window:open',
  windowCloseSelf: 'window:close-self',
  windowIgnoreMouse: 'window:ignore-mouse',
  windowDragStart: 'window:drag-start',
  windowDrag: 'window:drag',
  windowContextMenu: 'window:context-menu',
  cursorMoved: 'cursor:moved',
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

export interface LookTarget {
  x: number
  y: number
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
  /** 캐릭터 창 전용. 드래그 시작 시점의 창 위치를 기준으로 누적 델타(화면 px)를 보낸다. */
  dragStart(): void
  drag(dx: number, dy: number): void
  showContextMenu(): void
  /** 캐릭터 창 전용. 메인이 전역 커서 위치를 -1..1 시선 좌표로 바꿔 보낸다. */
  onCursorMoved(listener: (look: LookTarget) => void): () => void
  quitApp(): void
}
