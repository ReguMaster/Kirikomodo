import type { Settings, SettingsPatch } from './settings'
import type { ChatMessage } from './types'

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
  chatSend: 'chat:send',
  chatHistory: 'chat:history',
  chatClear: 'chat:clear',
  chatMessage: 'chat:message',
  chatProactive: 'chat:proactive',
  chatWindowState: 'chat:window-state',
  chatCleared: 'chat:cleared',
  chatExport: 'chat:export',
  settingsReset: 'settings:reset',
  appOpenLogs: 'app:open-logs',
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
  /** 사용자 메시지를 보내면 메인이 스크립트 응답을 만들고, 두 메시지를 모든 창에 chat:message로 푸시한다. */
  sendChat(text: string): Promise<ChatMessage>
  getChatHistory(): Promise<ChatMessage[]>
  clearChat(): Promise<void>
  onChatMessage(listener: (message: ChatMessage) => void): () => void
  /** 캐릭터 창 전용. 행동 엔진의 PROACTIVE_DIALOGUE를 메인에 넘겨 선제 대사를 받는다. */
  requestProactive(): void
  /** 캐릭터 창 전용. 채팅창 포커스 여부(true면 CHATTING). */
  onChatWindowState(listener: (focused: boolean) => void): () => void
  /** 기록 삭제가 어느 창에서 일어나든 모든 창이 비운다. */
  onChatCleared(listener: () => void): () => void
  /** 저장 대화상자를 띄워 전체 기록을 JSON으로 내보낸다. 취소하면 null. */
  exportChat(): Promise<string | null>
  resetSettings(): Promise<Settings>
  openLogsFolder(): void
  quitApp(): void
}
