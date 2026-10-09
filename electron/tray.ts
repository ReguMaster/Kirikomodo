import { Menu, Tray, app, nativeImage } from 'electron'
import { getSettings, onSettingsChanged, updateSettings } from './services/settings'
import { log } from './services/logger'
import { APP_RESOURCE } from './windows/load'
import { getCharacterWindow, onCharacterVisibilityChanged, toggleCharacterWindow } from './windows/character'
import { openChatWindow } from './windows/chat'
import { openSettingsWindow } from './windows/settings'

let tray: Tray | null = null

function buildMenu(): Menu {
  const visible = getCharacterWindow()?.isVisible() ?? false
  return Menu.buildFromTemplate([
    { label: visible ? '캐릭터 숨기기' : '캐릭터 표시', click: toggleCharacterWindow },
    { label: '대화 열기', click: () => openChatWindow() },
    { type: 'separator' },
    {
      label: '방해 금지',
      type: 'checkbox',
      checked: getSettings().behavior.doNotDisturb,
      click: (item) => void updateSettings({ behavior: { doNotDisturb: item.checked } })
    },
    { label: '설정', click: () => openSettingsWindow() },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ])
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildMenu())
}

// 트레이는 상주 앱의 유일한 완전 종료 경로다 (FR-001-4/5). 아이콘 로드 실패 시에도 메뉴는 유지한다.
export function createTray(): void {
  if (tray) return
  const icon = nativeImage.createFromPath(APP_RESOURCE('tray.png'))
  if (icon.isEmpty()) log.warn('tray', 'tray icon missing; using empty image')
  tray = new Tray(icon)
  tray.setToolTip('Kirikomodo')
  tray.on('click', toggleCharacterWindow)
  refreshTrayMenu()
  onSettingsChanged(refreshTrayMenu)
  onCharacterVisibilityChanged(refreshTrayMenu)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
