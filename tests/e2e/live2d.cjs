// Live2D 실렌더링 검증. `npm run test:e2e:live2d` (모델 지정: KMD_L2D_MODEL=<.model3.json>, 기본은 Haru 샘플)
// 내장 Core(external/live2dcubismcore)로 모델을 실제 가져오기 경로(importModel)로 불러와 캔버스가 그려지는지 본다.
// KMD_SHOT_DIR=<폴더> 로 표정·모션 캡처를 저장, KMD_HIRES=1 이면 창 배율 2 × DPR 2 로 1280x1600 캡처(육안 검수용).
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
if (process.env.KMD_HIRES) app.commandLine.appendSwitch('force-device-scale-factor', '2')
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

  await js(`window.kirikomodo.updateSettings({ character: { activeModelId: ${JSON.stringify(info.id)} }${process.env.KMD_HIRES ? ', window: { scale: 2 }' : ''} })`)
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

  // 모션·표정·물리가 있는 모델(키리코)만: 각 감정/모션을 재생해 화면이 바뀌는지, physics3 출력이 움직이는지 본다
  if (!info.motions?.length) return
  const shotDir = process.env.KMD_SHOT_DIR
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true })
  const snap = async (name) => {
    await until(async () => !(await js('window.__kmdLive2D.blinking()')), 1000) // 자동 깜빡임 도중 프레임은 찍지 않는다
    const img = await win.webContents.capturePage()
    if (shotDir) fs.writeFileSync(path.join(shotDir, `${name}.png`), img.toPNG())
    return img.toBitmap()
  }
  const diff = (a, b) => {
    let n = 0
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > 40) n++
    return n
  }
  const preview = (detail) => js(`document.dispatchEvent(new CustomEvent('kirikomodo:preview', { detail: ${JSON.stringify(detail)} }))`)
  await preview({ emotion: 'neutral' }) // 앱이 띄운 인사 말풍선의 감정이 남아 있으면 기준 컷이 오염된다
  await sleep(900)
  const base = await snap('neutral')
  for (const emotion of ['happy', 'playful', 'curious', 'concerned', 'annoyed', 'sleepy']) {
    await preview({ emotion })
    await sleep(700)
    const px = diff(base, await snap(`emotion-${emotion}`))
    check(`expression ${emotion} changes the face`, px > 200, `${px}px`)
  }
  await preview({ emotion: 'neutral' })
  await sleep(700)
  for (const motion of ['blink', 'look', 'greet', 'wave', 'headTilt', 'stretch', 'yawn', 'reactTap', 'rest']) {
    const before = await snap(`motion-${motion}-0`)
    await preview({ motion })
    await sleep(motion === 'blink' ? 120 : 600)
    const px = diff(before, await snap(`motion-${motion}-1`))
    check(`motion ${motion} moves the model`, px > 200, `${px}px`)
    await sleep(motion === 'rest' ? 0 : 1200)
  }
  const hook = await js('window.__kmdLive2D ? { physics: window.__kmdLive2D.physics } : null')
  check('physics3 loaded', hook?.physics === true, JSON.stringify(hook))
  if (hook?.physics) {
    const ids = ['ParamHairBackR', 'ParamHairBackL', 'ParamHairBackRTip', 'ParamTail', 'ParamTasselL']
    const samples = []
    for (let i = 0; i < 24; i++) {
      samples.push(await js(`${JSON.stringify(ids)}.map((id) => window.__kmdLive2D.param(id))`))
      await sleep(120)
    }
    const spread = (f) => Math.max(...samples.map(f)) - Math.min(...samples.map(f))
    check('physics3 moves hair/tail/tassel', ids.map((_, k) => spread((s) => s[k])).every((v) => v > 0.01 && v <= 2), samples.slice(0, 6).map((s) => s.map((v) => v.toFixed(2)).join('/')).join(' '))
    check('left/right hair strands swing differently', spread((s) => s[0] - s[1]) > 0.01, `${spread((s) => s[0] - s[1]).toFixed(3)}`)
  }
}

app.whenReady().then(() => run().catch((err) => { failed++; console.error('harness error', err) }).finally(() => { console.log(failed ? `\n${failed} FAILED` : '\nall passed'); app.exit(failed ? 1 : 0) }))
require(path.join(ROOT, 'out/main/main.js'))
