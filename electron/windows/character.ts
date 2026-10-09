import { BrowserWindow, powerMonitor, screen, type Rectangle } from 'electron'
import { clampToArea, cursorToLook } from '@shared/geometry'
import { IPC } from '@shared/ipc'
import type { Settings } from '@shared/settings'
import { onSettingsChanged, updateSettings } from '../services/settings'
import { log } from '../services/logger'
import { SECURE_WEB_PREFERENCES, loadRenderer } from './load'

export const CHARACTER_BASE_SIZE = { width: 320, height: 400 } as const
const POSITION_SAVE_DELAY_MS = 500
const SCREEN_EDGE_MARGIN = 16
const CURSOR_POLL_MS = 50
// 창 크기의 1.5배 거리에서 시선이 끝까지 돌아간다. 너무 예민하면 올리고 둔하면 내린다.
const LOOK_RANGE_FACTOR = 1.5

let win: BrowserWindow | null = null
let ignoringMouse = false
let positionSaveTimer: NodeJS.Timeout | null = null
let cursorTimer: NodeJS.Timeout | null = null
let lastLookKey = ''
let dragOrigin: Rectangle | null = null
const visibilityListeners = new Set<(visible: boolean) => void>()

export function getCharacterWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

function scaledSize(settings: Settings): { width: number; height: number } {
  return {
    width: Math.round(CHARACTER_BASE_SIZE.width * settings.window.scale),
    height: Math.round(CHARACTER_BASE_SIZE.height * settings.window.scale)
  }
}

// 창이 어느 모니터의 작업 영역에도 걸치지 않으면 가장 가까운 모니터 안으로 끌어온다 (FR-001-7, AC-13).
export function clampToWorkArea(bounds: Rectangle): Rectangle {
  return clampToArea(bounds, screen.getDisplayMatching(bounds).workArea)
}

function defaultPosition(size: { width: number; height: number }): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: area.x + area.width - size.width - SCREEN_EDGE_MARGIN,
    y: area.y + area.height - size.height - SCREEN_EDGE_MARGIN
  }
}

function initialBounds(settings: Settings): Rectangle {
  const size = scaledSize(settings)
  const { x, y } = settings.window
  const position = x !== null && y !== null ? { x, y } : defaultPosition(size)
  return clampToWorkArea({ ...size, ...position })
}

export function ensureCharacterVisibleOnScreen(): void {
  const target = getCharacterWindow()
  if (!target) return
  const current = target.getBounds()
  const clamped = clampToWorkArea(current)
  if (clamped.x !== current.x || clamped.y !== current.y) {
    log.info('window', 'character window moved back into work area', { from: current, to: clamped })
    target.setBounds(clamped)
  }
}

function schedulePositionSave(): void {
  if (positionSaveTimer) clearTimeout(positionSaveTimer)
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null
    const target = getCharacterWindow()
    if (!target) return
    const { x, y } = target.getBounds()
    void updateSettings({ window: { x, y } })
  }, POSITION_SAVE_DELAY_MS)
}

function applySettings(settings: Settings): void {
  const target = getCharacterWindow()
  if (!target) return
  if (target.isAlwaysOnTop() !== settings.window.alwaysOnTop) target.setAlwaysOnTop(settings.window.alwaysOnTop, 'floating')
  if (target.getOpacity() !== settings.window.opacity) target.setOpacity(settings.window.opacity)
  const size = scaledSize(settings)
  const bounds = target.getBounds()
  if (bounds.width !== size.width || bounds.height !== size.height) {
    target.setBounds(clampToWorkArea({ ...bounds, ...size }))
  }
  // 설정의 x/y가 null이면 '위치 초기화' 요청. 생성 직후 저장해 두므로 그 외에는 null이 아니다.
  if (settings.window.x === null && settings.window.y === null) {
    const home = defaultPosition(size)
    target.setPosition(home.x, home.y)
    schedulePositionSave()
  }
}

// 드래그는 renderer가 pointerdown 시점 대비 누적 델타를 보내고, 메인이 시작 위치에 더해 작업 영역 안으로 고정한다 (FR-002-6).
export function beginCharacterDrag(): void {
  dragOrigin = getCharacterWindow()?.getBounds() ?? null
}

export function dragCharacter(dx: number, dy: number): void {
  const target = getCharacterWindow()
  if (!target || !dragOrigin) return
  const next = clampToWorkArea({ ...dragOrigin, x: dragOrigin.x + dx, y: dragOrigin.y + dy })
  target.setPosition(next.x, next.y)
  schedulePositionSave()
}

// 전역 시선 추적. 커서가 창 밖에 있어도 따라가야 하므로 메인이 폴링해 renderer에 밀어준다.
function pollCursor(): void {
  const target = getCharacterWindow()
  if (!target || !target.isVisible()) return
  const look = cursorToLook(screen.getCursorScreenPoint(), target.getBounds(), LOOK_RANGE_FACTOR)
  const key = `${look.x},${look.y}`
  if (key === lastLookKey) return
  lastLookKey = key
  target.webContents.send(IPC.cursorMoved, look)
}

function startCursorTracking(): void {
  if (!cursorTimer) cursorTimer = setInterval(pollCursor, CURSOR_POLL_MS)
}

function stopCursorTracking(): void {
  if (cursorTimer) clearInterval(cursorTimer)
  cursorTimer = null
  lastLookKey = ''
}

// 투명 영역 클릭 통과. Renderer가 히트 테스트 결과를 알려주면 창 전체의 마우스 무시 여부를 바꾼다 (FR-001-3).
export function setCharacterIgnoreMouse(ignore: boolean): void {
  const target = getCharacterWindow()
  if (!target || ignoringMouse === ignore) return
  ignoringMouse = ignore
  target.setIgnoreMouseEvents(ignore, { forward: true })
}

export function toggleCharacterWindow(): void {
  const target = getCharacterWindow()
  if (!target) return
  if (target.isVisible()) target.hide()
  else target.show()
}

export function onCharacterVisibilityChanged(listener: (visible: boolean) => void): () => void {
  visibilityListeners.add(listener)
  return () => visibilityListeners.delete(listener)
}

function notifyVisibility(visible: boolean): void {
  for (const listener of visibilityListeners) listener(visible)
}

export function createCharacterWindow(settings: Settings): BrowserWindow {
  const existing = getCharacterWindow()
  if (existing) return existing

  win = new BrowserWindow({
    title: 'Kirikomodo',
    ...initialBounds(settings),
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
  if (settings.window.alwaysOnTop) win.setAlwaysOnTop(true, 'floating')
  win.once('ready-to-show', () => win?.show())
  win.on('moved', schedulePositionSave)
  if (settings.window.x === null || settings.window.y === null) schedulePositionSave()
  win.on('show', () => {
    startCursorTracking()
    notifyVisibility(true)
  })
  win.on('hide', () => {
    stopCursorTracking()
    notifyVisibility(false)
  })
  win.on('closed', () => {
    stopCursorTracking()
    win = null
    ignoringMouse = false
    dragOrigin = null
    notifyVisibility(false)
  })
  loadRenderer(win, 'character')
  return win
}

// 모니터 분리·해상도/DPI 변경·절전 복귀 뒤에도 캐릭터가 화면 밖에 갇히지 않게 한다.
export function watchCharacterEnvironment(): void {
  screen.on('display-removed', ensureCharacterVisibleOnScreen)
  screen.on('display-metrics-changed', ensureCharacterVisibleOnScreen)
  powerMonitor.on('resume', ensureCharacterVisibleOnScreen)
  onSettingsChanged(applySettings)
}
