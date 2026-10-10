import { app, session, type WebContents } from 'electron'
import { registerIpc } from './ipc'
import { closeDialogueStore, initDialogueStore } from './services/dialogue'
import { syncAutoStart } from './services/autostart'
import { log } from './services/logger'
import { registerModelProtocol, registerModelScheme } from './services/models'
import { flushSettings, getSettings, loadSettings, onSettingsChanged } from './services/settings'
import { createTray, destroyTray } from './tray'
import { createCharacterWindow, flushCharacterPosition, getCharacterWindow, watchCharacterEnvironment } from './windows/character'

const CSP = [
  "default-src 'self'",
  "script-src 'self' kmd-model:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: kmd-model:",
  "font-src 'self' data:",
  "connect-src 'self' kmd-model:"
].join('; ')

// 개발 서버(HMR)에서는 CSP를 걸지 않고, 패키징/프리뷰 실행에서만 강제한다.
function applyProductionCsp(): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
  })
}

// 렌더러가 죽으면(OOM·GPU 등) 로그를 남기고 한 번 다시 불러온다. 사용자가 직접 닫은 경우(clean-exit)는 제외.
function recoverRendererCrash(contents: WebContents): void {
  contents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    log.error('renderer', `process gone (${details.reason}), reloading`, { url: contents.getURL() })
    if (!contents.isDestroyed()) contents.reload()
  })
  contents.on('unresponsive', () => log.warn('renderer', 'unresponsive', { url: contents.getURL() }))
}

function showCharacter(): void {
  const win = getCharacterWindow()
  if (win) win.show()
  else createCharacterWindow(getSettings())
}

async function bootstrap(): Promise<void> {
  log.info('app', `Kirikomodo ${app.getVersion()} starting`)
  const settings = await loadSettings()
  applyProductionCsp()
  registerModelProtocol()
  initDialogueStore()
  registerIpc()
  app.on('web-contents-created', (_event, contents) => recoverRendererCrash(contents))
  createCharacterWindow(settings)
  watchCharacterEnvironment()
  createTray()
  syncAutoStart(settings.general.autoStart)
  onSettingsChanged((next) => syncAutoStart(next.general.autoStart))
  log.info('app', 'ready')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('io.github.regumaster.kirikomodo')
  registerModelScheme()
  app.on('second-instance', showCharacter)
  app.whenReady().then(bootstrap).catch((err) => {
    log.error('app', 'bootstrap failed', err)
    app.quit()
  })
}

// 상주 앱: 채팅/설정 창을 모두 닫아도 종료하지 않는다. 완전 종료는 트레이 '종료' → app.quit() 경유.
app.on('window-all-closed', () => undefined)

// 설정 저장이 끝난 뒤 종료한다. 한 번 막고 flush 후 다시 quit() 하므로 재진입을 막는다.
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  log.info('app', 'quitting')
  destroyTray()
  closeDialogueStore()
  flushCharacterPosition()
  void flushSettings().finally(() => app.quit())
})

process.on('uncaughtException', (err) => log.error('process', 'uncaughtException', err))
process.on('unhandledRejection', (reason) => log.error('process', 'unhandledRejection', reason))
