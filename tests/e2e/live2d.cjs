// Live2D 실렌더링 검증. `npm run test:e2e:live2d` (모델 지정: KMD_L2D_MODEL=<.model3.json>, 기본은 Haru 샘플)
// 내장 Core(external/live2dcubismcore)로 모델을 실제 가져오기 경로(importModel)로 불러와 캔버스가 그려지는지 본다.
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const model3 = process.env.KMD_L2D_MODEL || path.join(ROOT, 'assets/live2d-authoring/samples/live2dcubismcore/characters/haru_greeter_pro_jp/runtime/haru_greeter_t03.model3.json')
if (!fs.existsSync(model3)) {
  console.error(`모델이 없어요: ${model3}\n샘플은 docs/moc3-generation-handoff.md 의 "샘플 준비"를 참고하세요`)
  process.exit(2)
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kmd-l2d-'))
app.setPath('userData', userData)
app.setAppPath(ROOT)
if (!process.env.KMD_GPU) app.disableHardwareAcceleration()
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [model3] })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, timeout = 15000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(150)
  }
  return null
}
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function run() {
  const win = await until(() => BrowserWindow.getAllWindows()[0])
  await until(() => !win.webContents.isLoading())
  const js = (code) => win.webContents.executeJavaScript(code, true)
  win.webContents.on('console-message', (_e, level, msg) => level >= 2 && console.log(`[renderer:${level}] ${msg}`))

  const lib = await js('window.kirikomodo.listModels()')
  check('bundled Core detected', lib.coreAvailable === true && !fs.existsSync(path.join(userData, 'live2d')))
  const info = await js('window.kirikomodo.importModel()').catch((e) => ({ error: String(e) }))
  check('model imported', !!info?.id, JSON.stringify(info).slice(0, 200))
  if (!info?.id) return

  await js(`window.kirikomodo.updateSettings({ character: { activeModelId: ${JSON.stringify(info.id)} } })`)
  const canvas = await until(() => js(`!!document.querySelector('#character-stage canvas.live2d-canvas')`))
  check('live2d canvas mounted', !!canvas)
  await sleep(1500)
  check('no placeholder fallback', await js(`!document.querySelector('#character-stage svg.placeholder-character') && !document.querySelector('.speech-bubble')?.textContent?.includes('불러오지 못해')`), await js(`document.querySelector('.speech-bubble')?.textContent ?? ''`))

  const shot = await win.webContents.capturePage()
  const { width, height } = shot.getSize()
  const bitmap = shot.toBitmap()
  let opaque = 0
  for (let i = 3; i < bitmap.length; i += 4) if (bitmap[i] > 16) opaque++
  const ratio = opaque / (width * height)
  const out = path.join(userData, 'live2d-shot.png')
  fs.writeFileSync(out, shot.toPNG())
  check('canvas has drawn pixels', ratio > 0.05, `${(ratio * 100).toFixed(1)}% opaque, ${width}x${height} → ${out}`)
  if (process.env.KMD_SHOT) fs.copyFileSync(out, process.env.KMD_SHOT)
}

app.whenReady().then(() => run().catch((err) => { failed++; console.error('harness error', err) }).finally(() => { console.log(failed ? `\n${failed} FAILED` : '\nall passed'); app.exit(failed ? 1 : 0) }))
require(path.join(ROOT, 'out/main/main.js'))
