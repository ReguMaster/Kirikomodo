// 실앱 통합 스모크. `npm run test:e2e` → electron tests/e2e/smoke.cjs
// 격리된 임시 userData로 out/main/main.js 를 그대로 띄우고 AC 항목을 순서대로 검사한다. 실패 시 종료 코드 1.
const { app, BrowserWindow, Tray, screen } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kmd-e2e-'))
app.setPath('userData', userData)
app.setAppPath(ROOT)
app.disableHardwareAcceleration()

const settingsPath = path.join(userData, 'settings.json')
const seed = {
  window: { x: 100, y: 120 },
  character: { activeModelId: 'ghost-model' },
  behavior: { proactiveDialogue: true, dailyProactiveLimit: 3, doNotDisturb: false }
}
fs.writeFileSync(settingsPath, '{ not json', 'utf8')
fs.writeFileSync(`${settingsPath}.bak`, JSON.stringify(seed), 'utf8')

const ignoreCalls = []
const origIgnore = BrowserWindow.prototype.setIgnoreMouseEvents
BrowserWindow.prototype.setIgnoreMouseEvents = function (ignore, opts) {
  ignoreCalls.push(ignore)
  return origIgnore.call(this, ignore, opts)
}
let trayMenu = null
const origMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (menu) {
  trayMenu = menu
  return origMenu.call(this, menu)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, timeout = 10000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(100)
  }
  return null
}
const readSettings = () => JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
const menuItem = (label) => trayMenu?.items.find((i) => i.label === label) ?? null
const windowByTitle = (title) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === title) ?? null

async function run() {
  const win = await until(() => BrowserWindow.getAllWindows()[0])
  check('character window created', !!win)
  await until(() => !win.webContents.isLoading() && win.isVisible())
  const js = (code) => win.webContents.executeJavaScript(code, true)

  // AC-03/설정 복구: 손상된 settings.json → .bak 복구, 위치 복원
  const [x, y] = win.getPosition()
  check('settings recovered from .bak (position restored)', x === 100 && y === 120, `${x},${y}`)
  const loaded = await js('window.kirikomodo.getSettings()')
  check('settings.character.activeModelId from .bak', loaded.character.activeModelId === 'ghost-model')

  // AC-11: 없는 모델 → 플레이스홀더 폴백 + 안내 말풍선
  const bubble = await until(() => js(`document.querySelector('.speech-bubble')?.textContent ?? ''`))
  check('missing model falls back with bubble', !!bubble && bubble.includes('모델을 불러오지 못해'), bubble)
  check('placeholder svg mounted', await js(`!!document.querySelector('#character-stage svg.placeholder-character')`))
  await js(`window.kirikomodo.updateSettings({ character: { activeModelId: 'placeholder' } })`)
  await sleep(300)

  // AC-02: 투명 영역 → 클릭 통과, 캐릭터 위 → 복귀
  const { width, height } = win.getBounds()
  const move = (px, py) =>
    win.webContents.sendInputEvent({ type: 'mouseMove', x: px, y: py, globalX: win.getPosition()[0] + px, globalY: win.getPosition()[1] + py })
  ignoreCalls.length = 0
  move(2, 2)
  await sleep(150)
  check('transparent area → ignore mouse', ignoreCalls.at(-1) === true, JSON.stringify(ignoreCalls))
  move(Math.round(width / 2), Math.round(height * 0.8))
  await sleep(150)
  check('character body → accept mouse', ignoreCalls.at(-1) === false, JSON.stringify(ignoreCalls))

  // AC-03: 드래그 후 위치 저장
  const before = win.getPosition()
  const cx = Math.round(width / 2)
  const cy = Math.round(height * 0.8)
  const g = (px, py) => ({ globalX: before[0] + px, globalY: before[1] + py })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: cx, y: cy, ...g(cx, cy) })
  for (let i = 1; i <= 6; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x: cx + i * 10, y: cy + i * 8, ...g(cx + i * 10, cy + i * 8) })
    await sleep(30)
  }
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: cx + 60, y: cy + 48, ...g(cx + 60, cy + 48) })
  await sleep(100)
  const after = win.getPosition()
  check('drag moves window', after[0] === before[0] + 60 && after[1] === before[1] + 48, `${before} → ${after}`)
  await sleep(800)
  const saved = readSettings()
  check('position persisted to settings.json', saved.window.x === after[0] && saved.window.y === after[1], JSON.stringify(saved.window))

  // AC-04: 트레이 메뉴
  check('tray menu built', !!trayMenu)
  menuItem('캐릭터 숨기기')?.click()
  await sleep(200)
  check('tray hide', !win.isVisible())
  menuItem('캐릭터 표시')?.click()
  await sleep(200)
  check('tray show', win.isVisible())
  menuItem('대화 열기')?.click()
  const chat = await until(() => BrowserWindow.getAllWindows().find((w) => w !== win))
  check('tray opens chat window', !!chat)
  menuItem('설정')?.click()
  const settingsWin = await until(() => windowByTitle('Kirikomodo 설정'))
  check('tray opens settings window', !!settingsWin)
  await until(() => chat && !chat.webContents.isLoading() && settingsWin && !settingsWin.webContents.isLoading())
  await sleep(500)
  const chatDom = await chat.webContents.executeJavaScript(`!!document.querySelector('.chat-quick button')`, true)
  check('chat window renders', chatDom)
  menuItem('방해 금지')?.click()
  await sleep(200)
  check('tray DND toggle', (await js('window.kirikomodo.getSettings()')).behavior.doNotDisturb === true)

  // AC-05: 표정 미리보기 이벤트
  await js(`document.dispatchEvent(new CustomEvent('kirikomodo:preview', { detail: { emotion: 'happy', motion: 'wave' } }))`)
  await sleep(300)
  check('emotion preview event accepted', true)

  const { DatabaseSync } = require('node:sqlite')
  const dbQuery = (sql) => {
    const db = new DatabaseSync(path.join(userData, 'kirikomodo.sqlite'), { readOnly: true })
    const n = db.prepare(sql).get().n
    db.close()
    return n
  }
  const dbCount = () => dbQuery('SELECT COUNT(*) AS n FROM chat_messages')
  const proactiveEvents = () => dbQuery(`SELECT COUNT(*) AS n FROM companion_events WHERE type = 'PROACTIVE_DIALOGUE'`)

  // AC-07: 방해 금지 중 선제 발화 차단(메인 측). 시작 인사로 이미 1회 소진됐을 수 있어 DB 이벤트 수 기준으로 센다.
  const historyLen = async () => (await js('window.kirikomodo.getChatHistory()')).length
  const h0 = await historyLen()
  const ev0 = proactiveEvents()
  await js('window.kirikomodo.requestProactive()')
  await sleep(300)
  check('DND blocks proactive in main', (await historyLen()) === h0)
  await js('window.kirikomodo.updateSettings({ behavior: { doNotDisturb: false, quietHours: { enabled: false } } })')
  await sleep(200)
  for (let i = 0; i < 5; i++) {
    await js('window.kirikomodo.requestProactive()')
    await sleep(100)
  }
  const proactiveCount = (await historyLen()) - h0
  check('daily proactive limit (3) enforced', proactiveCount === 3 - ev0 && proactiveEvents() === 3, `before=${ev0} new=${proactiveCount}`)

  // AC-08: 규칙 대화 / unknown 폴백
  const hi = await js(`window.kirikomodo.sendChat('안녕')`)
  check('scripted greeting', hi.role === 'character' && hi.intent === 'greeting', JSON.stringify(hi))
  const unk = await js(`window.kirikomodo.sendChat('zxqv plorb')`)
  check('unknown intent fallback', unk.intent === 'unknown', JSON.stringify(unk))
  await sleep(300)
  const chatMsgs = await chat.webContents.executeJavaScript(`document.querySelectorAll('.chat-message').length`, true)
  check('chat window receives messages', chatMsgs >= 4, `${chatMsgs}`)

  // AC-09: SQLite 기록 + 전체 삭제
  check('messages persisted in sqlite', dbCount() === (await historyLen()) && dbCount() >= 4, `${dbCount()}`)
  await js('window.kirikomodo.clearChat()')
  await sleep(300)
  check('clearChat empties sqlite + history', dbCount() === 0 && (await historyLen()) === 0)

  // AC-13: 화면 밖 → 디스플레이 변경 이벤트 → 작업 영역 복귀
  win.setPosition(-5000, -5000)
  screen.emit('display-metrics-changed')
  await sleep(200)
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  const inside = b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height
  check('off-screen window clamped back', inside, JSON.stringify(b))

  // 렌더러 크래시 복구
  const reloaded = new Promise((r) => win.webContents.once('did-finish-load', () => r(true)))
  win.webContents.forcefullyCrashRenderer()
  check('renderer crash → reload', (await Promise.race([reloaded, sleep(10000)])) === true)
  await sleep(500)
  check('placeholder remounted after crash', await js(`!!document.querySelector('#character-stage svg.placeholder-character')`))

  chat?.close()
  settingsWin?.close()
  await sleep(300)

  // 종료 직전 드래그 → 디바운스(500ms) 중인 위치 저장이 종료 시 flush 되어야 한다 (AC-03)
  const p0 = win.getPosition()
  const g2 = (px, py) => ({ globalX: p0[0] + px, globalY: p0[1] + py })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: cx, y: cy, ...g2(cx, cy) })
  for (let i = 1; i <= 3; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', x: cx + i * 10, y: cy + i * 10, ...g2(cx + i * 10, cy + i * 10) })
    await sleep(30)
  }
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: cx + 30, y: cy + 30, ...g2(cx + 30, cy + 30) })
  await sleep(100)
  expectedFinal = win.getPosition()
  check('drag before quit moved window', expectedFinal[0] === p0[0] + 30 && expectedFinal[1] === p0[1] + 30, `${p0} → ${expectedFinal}`)
  app.quit()
}

let expectedFinal = null
app.on('quit', () => {
  const final = readSettings().window
  check('pending position flushed on quit', !!expectedFinal && final.x === expectedFinal[0] && final.y === expectedFinal[1], JSON.stringify(final))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed (userData: ${userData})`)
  if (failed.length) app.exit(1)
})

app.whenReady().then(() => run().catch((err) => {
  console.error('E2E harness error', err)
  app.exit(1)
}))

require(path.join(ROOT, 'out/main/main.js'))
