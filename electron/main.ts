import { app, session } from 'electron'
import { registerIpc } from './ipc'
import { log } from './services/logger'
import { flushSettings, getSettings, loadSettings } from './services/settings'
import { createCharacterWindow, getCharacterWindow } from './windows/character'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'"
].join('; ')

// 개발 서버(HMR)에서는 CSP를 걸지 않고, 패키징/프리뷰 실행에서만 강제한다.
function applyProductionCsp(): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
  })
}

function showCharacter(): void {
  const win = getCharacterWindow()
  if (win) win.show()
  else createCharacterWindow(getSettings())
}

async function bootstrap(): Promise<void> {
  log.info('app', `Kirikomodo ${app.getVersion()} starting`)
  await loadSettings()
  applyProductionCsp()
  registerIpc()
  createCharacterWindow(getSettings())
  log.info('app', 'ready')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('io.github.regumaster.kirikomodo')
  app.on('second-instance', showCharacter)
  app.whenReady().then(bootstrap).catch((err) => {
    log.error('app', 'bootstrap failed', err)
    app.quit()
  })
}

// 상주 앱: 채팅/설정 창을 모두 닫아도 종료하지 않는다. 완전 종료는 app.quit() 경유.
app.on('window-all-closed', () => undefined)

app.on('before-quit', () => {
  log.info('app', 'quitting')
  void flushSettings()
})

process.on('uncaughtException', (err) => log.error('process', 'uncaughtException', err))
process.on('unhandledRejection', (reason) => log.error('process', 'unhandledRejection', reason))
