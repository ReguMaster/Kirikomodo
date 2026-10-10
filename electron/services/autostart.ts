import { app } from 'electron'
import { log } from './logger'

// Windows 시작 프로그램 등록 (FR-001-8). 개발 실행은 electron.exe가 등록되므로 패키징 빌드에서만 적용한다.
export function syncAutoStart(enabled: boolean): void {
  if (!app.isPackaged) {
    log.info('autostart', `skipped in dev build (requested: ${enabled})`)
    return
  }
  try {
    if (app.getLoginItemSettings().openAtLogin === enabled) return
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath })
    log.info('autostart', enabled ? 'registered' : 'unregistered')
  } catch (err) {
    log.error('autostart', 'failed to update login item', err)
  }
}
