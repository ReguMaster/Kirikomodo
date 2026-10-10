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

  const rewritten = path.join(tmp, 'haru-roundtrip.moc3')
  const rt = spawnSync('python', [path.join(__dirname, 'moc3.py'), 'roundtrip', haru, rewritten], { encoding: 'utf8' })
  assert.strictEqual(rt.status, 0, rt.stdout + rt.stderr)
  assert.ok(fs.readFileSync(haru).equals(fs.readFileSync(rewritten)), '라운드트립 결과가 원본과 달라요')
  assert.match(inspect(rewritten).stdout, /VALID/)
  console.log('haru: moc3.py roundtrip byte-identical, Core VALID')
} else {
  console.log('샘플 폴더 없음 — Haru 검증은 건너뜀')
}
// 생성기: 기하 도형 모델을 처음부터 만들어 Core 가 열고, 각 파라미터가 의도한 드로어블만 움직이는지 본다
const demo = path.join(tmp, 'demo.moc3')
const gen = spawnSync('python', [path.join(__dirname, 'gen.py'), 'demo', demo], { encoding: 'utf8' })
assert.strictEqual(gen.status, 0, gen.stdout + gen.stderr)
const effect = (...sets) => {
  const r = inspect(demo, '--json', ...sets)
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  const moved = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).setEffect.movedDrawables
  return Object.fromEntries(moved.map((m) => [m.id, [m.dx, m.dy, m.dOpacity]]))
}
assert.deepStrictEqual(effect('ParamMoveX=1'), { MeshCenter: [0.2, 0, 0], MeshArm: [0.2, 0, 0], MeshHead: [0.2, 0, 0], MeshHand: [0.2, 0, 0] }, '루트 워프가 자손 전부를 옮겨야 해요')
assert.deepStrictEqual(effect('ParamOpacity=0'), { MeshCenter: [0, 0, -1] }, '아트메시 불투명도 키폼')
assert.deepStrictEqual(effect('ParamMeshY=1', 'ParamMix=1'), { MeshFree: [0.1, -0.3, 0] }, '2-파라미터 키폼 조합(저장 y 아래 + → Core 는 위 +)')
assert.deepStrictEqual(effect('ParamHeadY=1'), { MeshHead: [0, -0.1, 0] }, '워프 안의 워프')
assert.deepStrictEqual(Object.keys(effect('ParamAngle=30')), ['MeshArm', 'MeshHand'], '회전 디포머와 그 안의 회전')
assert.deepStrictEqual(Object.keys(effect('ParamHand=30')), ['MeshHand'], '중첩 회전은 자기 자식만')
console.log('gen.py demo: Core VALID, 7 parameters move the intended drawables')

// 키리코: atlas 가 있으면 kiriko.py 로 조립해 Core VALID + 핵심 파라미터가 드로어블을 움직이는지 본다(에셋은 Git 무시라 없으면 건너뜀)
const atlas = path.join(__dirname, '../../assets/models/private/kiriko/atlas.json')
if (fs.existsSync(atlas)) {
  const kdir = path.join(tmp, 'kiriko')
  const kg = spawnSync('python', [path.join(__dirname, 'kiriko.py'), kdir], { encoding: 'utf8' })
  assert.strictEqual(kg.status, 0, kg.stdout + kg.stderr)
  const kmoc = path.join(kdir, 'kiriko.moc3')
  const keff = (...sets) => {
    const r = inspect(kmoc, '--json', ...sets)
    assert.strictEqual(r.status, 0, r.stdout + r.stderr)
    return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).setEffect.movedDrawables.map((m) => m.id)
  }
  assert.ok(keff('ParamAngleX=30').includes('Face_Base'), '고개 좌우가 얼굴을 움직여야 해요')
  assert.ok(keff('ParamEyeLOpen=0').includes('Eye_L_Closed'), '눈 감김이 감은 눈 레이어를 켜야 해요')
  assert.deepStrictEqual(keff('ParamMouthOpenY=1'), ['Mouth_Line', 'Mouth_Open'], '입 열림')
  assert.deepStrictEqual(keff('ParamTail=1'), ['Tail'], '꼬리')
  assert.ok(keff('ParamBodyAngleX=10').includes('Torso'), '몸 기울기')
  assert.deepStrictEqual(keff('ParamArmR=1'), ['Sleeve_R'], '오른쪽 소매 스윙')
  assert.deepStrictEqual(keff('ParamArmL=1'), ['Sleeve_L'], '왼쪽 소매 스윙')
  console.log('kiriko.py: Core VALID, head/eye/mouth/tail/body parameters move the intended drawables')
  const km3 = JSON.parse(fs.readFileSync(path.join(kdir, 'kiriko.model3.json'), 'utf8')).FileReferences
  assert.strictEqual(Object.keys(km3.Motions).length, 10, '모션 10종')
  assert.strictEqual(km3.Expressions.length, 7, '표정 7종')
  for (const f of [...Object.values(km3.Motions).flat(), ...km3.Expressions].map((e) => e.File).concat('model-map.json')) {
    assert.ok(fs.existsSync(path.join(kdir, f)), f)
  }
  console.log('kiriko_anim.py: 10 motions / 7 expressions / model-map.json written and registered')
  const phys = JSON.parse(fs.readFileSync(path.join(kdir, km3.Physics), 'utf8'))
  assert.strictEqual(phys.PhysicsSettings.length, phys.Meta.PhysicsSettingCount, 'physics3 설정 수')
  assert.ok(phys.PhysicsSettings.length >= 11, 'physics3 설정 11종 이상')
  console.log(`kiriko_physics.py: ${phys.PhysicsSettings.length} physics settings registered`)
}

console.log('moc3 inspector selftest passed')
