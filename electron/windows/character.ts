import { BrowserWindow, powerMonitor, screen, type Rectangle } from 'electron'
import { clampToArea } from '@shared/geometry'
import type { Settings } from '@shared/settings'
import { onSettingsChanged, updateSettings } from '../services/settings'
import { log } from '../services/logger'
import { SECURE_WEB_PREFERENCES, loadRenderer } from './load'

export const CHARACTER_BASE_SIZE = { width: 320, height: 400 } as const
const POSITION_SAVE_DELAY_MS = 500
const SCREEN_EDGE_MARGIN = 16

let win: BrowserWindow | null = null
let ignoringMouse = false
let positionSaveTimer: NodeJS.Timeout | null = null
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
  win.on('show', () => notifyVisibility(true))
  win.on('hide', () => notifyVisibility(false))
  win.on('closed', () => {
    win = null
    ignoringMouse = false
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
