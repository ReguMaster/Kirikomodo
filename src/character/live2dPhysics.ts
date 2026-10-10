// physics3.json 파서와 진자 시뮬레이션(공식 CubismPhysics 알고리즘). DOM·Core 의존 없음.

interface Vec {
  x: number
  y: number
}

interface PhysicsInput {
  id: string
  weight: number
  type: 'X' | 'Y' | 'Angle'
  reflect: boolean
}

interface PhysicsOutput {
  id: string
  vertex: number
  scale: number
  weight: number
  reflect: boolean
}

interface Particle {
  initial: Vec
  position: Vec
  last: Vec
  velocity: Vec
  force: Vec
  lastGravity: Vec
  mobility: number
  delay: number
  acceleration: number
  radius: number
}

interface Range {
  min: number
  def: number
  max: number
}

interface PhysicsSetting {
  inputs: PhysicsInput[]
  outputs: PhysicsOutput[]
  particles: Particle[]
  normPos: Range
  normAngle: Range
}

export interface PhysicsData {
  gravity: Vec
  wind: Vec
  settings: PhysicsSetting[]
}

export interface ParamAccess {
  get(id: string): number | undefined
  range(id: string): [number, number] | undefined
  set(id: string, value: number): void
}

const AIR_RESISTANCE = 5
const MOVEMENT_THRESHOLD = 0.001

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const vec = (v: unknown, fallback: Vec): Vec => ({ x: num(obj(v).X, fallback.x), y: num(obj(v).Y, fallback.y) })
const range = (v: unknown): Range => ({ min: num(obj(v).Minimum, -10), def: num(obj(v).Default, 0), max: num(obj(v).Maximum, 10) })

export function parsePhysics3(json: unknown): PhysicsData {
  const root = obj(json)
  const forces = obj(obj(root.Meta).EffectiveForces)
  const settings: PhysicsSetting[] = []
  for (const raw of Array.isArray(root.PhysicsSettings) ? root.PhysicsSettings.map(obj) : []) {
    const inputs: PhysicsInput[] = (Array.isArray(raw.Input) ? raw.Input.map(obj) : [])
      .map((i) => ({
        id: String(obj(i.Source).Id ?? ''),
        weight: num(i.Weight, 100) / 100,
        type: (i.Type === 'Y' || i.Type === 'Angle' ? i.Type : 'X') as PhysicsInput['type'],
        reflect: i.Reflect === true
      }))
      .filter((i) => i.id)
    const outputs: PhysicsOutput[] = (Array.isArray(raw.Output) ? raw.Output.map(obj) : [])
      .filter((o) => o.Type !== 'X' && o.Type !== 'Y')
      .map((o) => ({
        id: String(obj(o.Destination).Id ?? ''),
        vertex: Math.max(1, Math.floor(num(o.VertexIndex, 1))),
        scale: num(o.Scale, 1),
        weight: num(o.Weight, 100) / 100,
        reflect: o.Reflect === true
      }))
      .filter((o) => o.id)
    const particles: Particle[] = []
    for (const v of Array.isArray(raw.Vertices) ? raw.Vertices.map(obj) : []) {
      const prev = particles[particles.length - 1]
      const radius = prev ? num(v.Radius, 0) : 0
      const initial = prev ? { x: prev.initial.x, y: prev.initial.y + radius } : { x: 0, y: 0 }
      particles.push({
        initial,
        position: { ...initial },
        last: { ...initial },
        velocity: { x: 0, y: 0 },
        force: { x: 0, y: 0 },
        lastGravity: { x: 0, y: 1 },
        mobility: num(v.Mobility, 1),
        delay: num(v.Delay, 1),
        acceleration: num(v.Acceleration, 1),
        radius
      })
    }
    if (particles.length < 2 || outputs.length === 0) continue
    for (const o of outputs) o.vertex = Math.min(o.vertex, particles.length - 1)
    const norm = obj(raw.Normalization)
    settings.push({ inputs, outputs, particles, normPos: range(norm.Position), normAngle: range(norm.Angle) })
  }
  return { gravity: vec(forces.Gravity, { x: 0, y: -1 }), wind: vec(forces.Wind, { x: 0, y: 0 }), settings }
}

function directionToRadian(from: Vec, to: Vec): number {
  let r = Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x)
  while (r < -Math.PI) r += Math.PI * 2
  while (r > Math.PI) r -= Math.PI * 2
  return r
}

function normalize(value: number, min: number, max: number, n: Range, inverted: boolean): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const v = Math.max(lo, Math.min(hi, value))
  const mid = lo + (hi - lo) / 2
  const nLo = Math.min(n.min, n.max)
  const nHi = Math.max(n.min, n.max)
  const d = v - mid
  let result = n.def
  if (d > 0 && hi !== mid) result = d * ((nHi - n.def) / (hi - mid)) + n.def
  else if (d < 0 && lo !== mid) result = d * ((nLo - n.def) / (lo - mid)) + n.def
  return inverted ? result : -result
}

function updateParticles(strand: Particle[], translation: Vec, angleDeg: number, wind: Vec, threshold: number, dt: number): void {
  strand[0].position = { ...translation }
  const rad = (angleDeg * Math.PI) / 180
  const gravity = { x: Math.sin(rad), y: Math.cos(rad) }
  for (let i = 1; i < strand.length; i++) {
    const p = strand[i]
    const prev = strand[i - 1]
    p.force = { x: gravity.x * p.acceleration + wind.x, y: gravity.y * p.acceleration + wind.y }
    p.last = { ...p.position }
    const delay = p.delay * dt * 30
    let dx = p.position.x - prev.position.x
    let dy = p.position.y - prev.position.y
    const r = directionToRadian(p.lastGravity, p.force) / AIR_RESISTANCE
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    ;[dx, dy] = [cos * dx - dy * sin, sin * dx + dy * cos]
    let x = prev.position.x + dx + p.velocity.x * delay + p.force.x * delay * delay
    let y = prev.position.y + dy + p.velocity.y * delay + p.force.y * delay * delay
    const len = Math.hypot(x - prev.position.x, y - prev.position.y) || 1
    x = prev.position.x + ((x - prev.position.x) / len) * p.radius
    y = prev.position.y + ((y - prev.position.y) / len) * p.radius
    p.position = { x, y }
    if (Math.abs(p.velocity.x) < threshold) p.velocity.x = 0
    if (delay !== 0) p.velocity = { x: ((x - p.last.x) / delay) * p.mobility, y: ((y - p.last.y) / delay) * p.mobility }
    p.force = { x: 0, y: 0 }
    p.lastGravity = gravity
  }
}

// ponytail: 가변 dt 1회 적분. 프레임이 크게 튀면 공식처럼 고정 스텝 분할로 바꾼다
export function stepPhysics(data: PhysicsData, params: ParamAccess, dtSeconds: number): void {
  if (dtSeconds <= 0) return
  for (const s of data.settings) {
    let angle = 0
    const t = { x: 0, y: 0 }
    for (const input of s.inputs) {
      const value = params.get(input.id)
      const r = params.range(input.id)
      if (value === undefined || !r) continue
      if (input.type === 'Angle') angle += normalize(value, r[0], r[1], s.normAngle, input.reflect) * input.weight
      else t[input.type === 'X' ? 'x' : 'y'] += normalize(value, r[0], r[1], s.normPos, input.reflect) * input.weight
    }
    const rad = (-angle * Math.PI) / 180
    const translation = { x: t.x * Math.cos(rad) - t.y * Math.sin(rad), y: t.x * Math.sin(rad) + t.y * Math.cos(rad) }
    updateParticles(s.particles, translation, angle, data.wind, MOVEMENT_THRESHOLD * s.normPos.max, dtSeconds)
    for (const o of s.outputs) {
      const r = params.range(o.id)
      const current = params.get(o.id)
      if (!r || current === undefined) continue
      const p = s.particles
      const i = o.vertex
      const dir = { x: p[i].position.x - p[i - 1].position.x, y: p[i].position.y - p[i - 1].position.y }
      const parent = i >= 2 ? { x: p[i - 1].position.x - p[i - 2].position.x, y: p[i - 1].position.y - p[i - 2].position.y } : { x: -data.gravity.x, y: -data.gravity.y }
      let value = directionToRadian(parent, dir) * (o.reflect ? -1 : 1) * o.scale
      value = Math.max(r[0], Math.min(r[1], value))
      params.set(o.id, o.weight >= 1 ? value : current * (1 - o.weight) + value * o.weight)
    }
  }
}
