// 판정기 자체검증. `npm run test:moc3`. Haru 샘플(assets/live2d-authoring/samples)이 있으면 통과 케이스도 본다.
const { spawnSync } = require('node:child_process')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const inspect = (file, ...rest) => spawnSync(process.execPath, [path.join(__dirname, 'inspect-core.cjs'), file, ...rest], { encoding: 'utf8' })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moc3-'))

const zeros = path.join(tmp, 'zeros.moc3')
fs.writeFileSync(zeros, Buffer.alloc(2000))
const bad = inspect(zeros)
assert.strictEqual(bad.status, 1, '0 으로 채운 파일은 거부돼야 해요')
assert.match(bad.stdout, /INVALID/)

const sample = path.join(__dirname, '../../assets/live2d-authoring/samples/live2dcubismcore')
if (fs.existsSync(sample)) {
  const haru = path.join(sample, 'characters/haru_greeter_pro_jp/runtime/haru_greeter_t03.moc3')
  const ok = inspect(haru, '--json', 'ParamAngleX=30')
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr)
  const report = JSON.parse(ok.stdout.slice(ok.stdout.indexOf('{')))
  assert.deepStrictEqual([report.parts.length, report.drawables.length, report.parameters.length], [19, 84, 42])
  assert.ok(report.setEffect.movedDrawables.length > 0, 'ParamAngleX 가 드로어블을 움직여야 해요')
  console.log('haru: valid, 19 parts / 84 drawables / 42 parameters, ParamAngleX moves drawables')
} else {
  console.log('샘플 폴더 없음 — Haru 검증은 건너뜀')
}
console.log('moc3 inspector selftest passed')
