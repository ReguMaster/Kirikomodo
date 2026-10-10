// moc3 판정기: 내장 Cubism Core(external/live2dcubismcore)로 moc3 를 열어 유효성·구조·파라미터 반응을 출력한다.
// 사용: node tools/moc3/inspect-core.cjs <file.moc3> [--json] [--set ParamId=value ...]
// Core 가 거부하면 "INVALID" 와 Core 로그를 내고 종료 코드 1. 생성기가 만든 파일의 합격 기준으로 쓴다.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--') && !/^[\w.]+=/.test(a))
const asJson = args.includes('--json')
const sets = args.filter((a) => /^[\w.]+=-?[\d.]+$/.test(a)).map((a) => a.split('='))
if (!file) {
  console.error('usage: node tools/moc3/inspect-core.cjs <file.moc3> [--json] [ParamId=value ...]')
  process.exit(2)
}

// emscripten 래퍼가 Node 를 감지해 __dirname/require 를 요구한다.
globalThis.__dirname = process.cwd()
globalThis.require = require
vm.runInThisContext(fs.readFileSync(path.resolve(__dirname, '../../external/live2dcubismcore/live2dcubismcore.min.js'), 'utf8'))
const Core = globalThis.Live2DCubismCore

const logs = []
Core.Logging.csmSetLogFunction((m) => logs.push(String(m).trim()))

const buf = fs.readFileSync(file)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const report = { file, bytes: buf.length, coreVersion: Core.Version.csmGetVersion(), latestMocVersion: Core.Version.csmGetLatestMocVersion() }

const moc = Core.Moc.fromArrayBuffer(ab)
if (!moc) {
  console.log(`INVALID: Core 가 moc3 를 거부했어요 (${buf.length} bytes)`)
  logs.forEach((l) => console.log(`  core: ${l}`))
  process.exit(1)
}
const model = Core.Model.fromMoc(moc)
if (!model) {
  console.log('INVALID: Moc 는 열렸지만 Model 초기화에 실패했어요')
  logs.forEach((l) => console.log(`  core: ${l}`))
  process.exit(1)
}

const { parameters: P, parts: T, drawables: D, canvasinfo: C } = model
const snapshot = () => {
  model.update()
  return Array.from({ length: D.count }, (_, i) => {
    const v = D.vertexPositions[i]
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let k = 0; k < D.vertexCounts[i]; k++) {
      x0 = Math.min(x0, v[2 * k]); x1 = Math.max(x1, v[2 * k])
      y0 = Math.min(y0, v[2 * k + 1]); y1 = Math.max(y1, v[2 * k + 1])
    }
    return { x0, y0, x1, y1, opacity: D.opacities[i] }
  })
}
const round = (n) => Math.round(n * 1000) / 1000
const base = snapshot()

report.canvas = { width: C.CanvasWidth, height: C.CanvasHeight, originX: C.CanvasOriginX, originY: C.CanvasOriginY, pixelsPerUnit: C.PixelsPerUnit }
report.parameters = Array.from({ length: P.count }, (_, i) => ({ id: P.ids[i], min: P.minimumValues[i], max: P.maximumValues[i], default: P.defaultValues[i], keys: P.keyValues?.[i]?.length ?? undefined }))
report.parts = Array.from({ length: T.count }, (_, i) => ({ id: T.ids[i], parent: T.parentIndices[i] }))
report.drawables = Array.from({ length: D.count }, (_, i) => ({
  id: D.ids[i], texture: D.textureIndices[i], vertices: D.vertexCounts[i], indices: D.indexCounts[i], masks: D.maskCounts[i],
  flags: D.constantFlags[i], parentPart: D.parentPartIndices[i], bbox: [round(base[i].x0), round(base[i].y0), round(base[i].x1), round(base[i].y1)]
}))

if (sets.length) {
  for (const [id, value] of sets) {
    const idx = report.parameters.findIndex((p) => p.id === id)
    if (idx < 0) { console.error(`알 수 없는 파라미터: ${id}`); process.exit(2) }
    P.values[idx] = Number(value)
  }
  const moved = snapshot()
  report.setEffect = {
    set: Object.fromEntries(sets),
    movedDrawables: moved
      .map((m, i) => ({ id: D.ids[i], dx: round(m.x0 - base[i].x0), dy: round(m.y0 - base[i].y0), dOpacity: round(m.opacity - base[i].opacity) }))
      .filter((m) => m.dx || m.dy || m.dOpacity)
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`VALID  ${file}  ${buf.length} bytes  Core ${report.coreVersion.toString(16)} (latest moc v${report.latestMocVersion})`)
  console.log(`canvas ${C.CanvasWidth}x${C.CanvasHeight} origin(${C.CanvasOriginX},${C.CanvasOriginY}) ppu ${C.PixelsPerUnit}`)
  console.log(`parameters ${P.count}, parts ${T.count}, drawables ${D.count}`)
  report.parameters.forEach((p) => console.log(`  param ${p.id} [${p.min}..${p.max}] default ${p.default}`))
  report.parts.forEach((p) => console.log(`  part  ${p.id} parent ${p.parent}`))
  report.drawables.forEach((d) => console.log(`  draw  ${d.id} tex ${d.texture} v${d.vertices} i${d.indices} masks ${d.masks} bbox ${d.bbox.join(',')}`))
  if (report.setEffect) console.log(`set ${JSON.stringify(report.setEffect.set)} → ${report.setEffect.movedDrawables.length} drawables changed`, report.setEffect.movedDrawables.slice(0, 8))
}
model.release()
moc._release()
