import type { CharacterRenderer, Emotion, HitArea, Motion } from '@shared/types'
import { CORE_FILE, MODEL_MAP_FILE, coreScriptUrl, inspectModel3, modelFileUrl, type ModelInfo, type Model3Summary } from '@shared/live2d'
import type { PlaceholderOptions } from './PlaceholderRenderer'
import { evaluateCurve, motionWeight, parseExpression3, parseMotion3, type ExpressionData, type MotionData } from './live2dMotion'
import { parsePhysics3, stepPhysics, type ParamAccess, type PhysicsData } from './live2dPhysics'

type Core = typeof Live2DCubismCore

interface ModelMap {
  motions: Record<string, string>
  emotions: Record<string, string>
}

interface ActiveMotion {
  data: MotionData
  priority: number
  start: number
  resolve: (done: boolean) => void
}

interface ActiveExpression {
  data: ExpressionData
  start: number
}

interface Mesh {
  pos: WebGLBuffer
  uv: WebGLBuffer
  idx: WebGLBuffer
}

const MOTION_GROUP_ALIASES: Record<Motion, string[]> = {
  idle: ['Idle'],
  blink: ['Blink'],
  look: ['Look'],
  greet: ['Greet', 'Greeting', 'Hello'],
  wave: ['Wave'],
  headTilt: ['HeadTilt', 'Tilt'],
  stretch: ['Stretch'],
  yawn: ['Yawn'],
  reactTap: ['ReactTap', 'Tap', 'TapBody', 'Tap@Body', 'Flick', 'FlickDown'],
  rest: ['Rest', 'Sleep']
}

// 표정 파일이 없는 모델용 기본 표정(표준 파라미터에 Add 블렌드).
const EMOTION_PARAMS: Record<Emotion, Record<string, number>> = {
  neutral: {},
  happy: { ParamMouthForm: 1, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamCheek: 1 },
  playful: { ParamMouthForm: 0.8, ParamAngleZ: 8, ParamEyeRSmile: 1 },
  curious: { ParamAngleZ: -8, ParamBrowLY: 0.4, ParamBrowRY: 0.4 },
  concerned: { ParamMouthForm: -0.7, ParamBrowLY: -0.5, ParamBrowRY: -0.5, ParamBrowLAngle: 0.5, ParamBrowRAngle: 0.5 },
  sleepy: { ParamEyeLOpen: -0.6, ParamEyeROpen: -0.6, ParamMouthOpenY: 0.2, ParamAngleY: -8 },
  annoyed: { ParamMouthForm: -0.6, ParamBrowLAngle: -0.8, ParamBrowRAngle: -0.8, ParamBrowLY: -0.3, ParamBrowRY: -0.3 }
}

const BLINK_MS = 180
const EMOTION_FADE_S = 0.3
const FLAG_ADDITIVE = 1
const FLAG_MULTIPLICATIVE = 2
const FLAG_INVERTED_MASK = 8
const FLAG_VISIBLE = 1

const VERTEX_SHADER = `
attribute vec2 a_pos; attribute vec2 a_uv; uniform vec4 u_xf; varying vec2 v_uv;
void main() { v_uv = vec2(a_uv.x, 1.0 - a_uv.y); gl_Position = vec4(a_pos.x * u_xf.x + u_xf.y, a_pos.y * u_xf.z + u_xf.w, 0.0, 1.0); }`
const FRAGMENT_SHADER = `
precision mediump float; uniform sampler2D u_tex; uniform float u_opacity; varying vec2 v_uv;
void main() { vec4 c = texture2D(u_tex, v_uv); if (c.a < 0.004) discard; gl_FragColor = c * u_opacity; }`

let corePromise: Promise<Core> | null = null

// Core는 사용자가 userData/live2d 에 둔 파일을 kmd-model:// 로 한 번만 주입한다.
export function loadCubismCore(): Promise<Core> {
  if (typeof Live2DCubismCore !== 'undefined') return Promise.resolve(Live2DCubismCore)
  corePromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = coreScriptUrl()
    script.onload = () => (typeof Live2DCubismCore !== 'undefined' ? resolve(Live2DCubismCore) : reject(new Error('Cubism Core 전역이 없어요')))
    script.onerror = () => {
      corePromise = null
      script.remove()
      reject(new Error(`Cubism Core(${CORE_FILE})를 찾지 못했어요`))
    }
    document.head.appendChild(script)
  })
  return corePromise
}

async function fetchModelFile(modelId: string, rel: string, as: 'json' | 'buffer'): Promise<unknown> {
  const res = await fetch(modelFileUrl(modelId, rel))
  if (!res.ok) throw new Error(`모델 파일을 읽지 못했어요: ${rel}`)
  return as === 'json' ? res.json() : res.arrayBuffer()
}

type DebugWindow = Window & { __kmdLive2D?: { param: (id: string) => number | undefined; physics: boolean } }

// Cubism Core 를 직접 다루는 최소 WebGL 렌더러. 포즈·모션 사운드는 지원하지 않는다.
export class Live2DRenderer implements CharacterRenderer {
  private options: PlaceholderOptions
  private container: HTMLElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private loc = { pos: 0, uv: 0, xf: null as WebGLUniformLocation | null, opacity: null as WebGLUniformLocation | null }
  private moc: Live2DCubismCore.Moc | null = null
  private model: Live2DCubismCore.Model | null = null
  private textures: WebGLTexture[] = []
  private meshes: Mesh[] = []
  private base = new Float32Array(0)
  private paramIndex = new Map<string, number>()
  private summary: Model3Summary | null = null
  private motions: Record<string, MotionData[]> = {}
  private expressions: Record<string, ExpressionData> = {}
  private map: ModelMap = { motions: {}, emotions: {} }
  private physics: PhysicsData | null = null
  private hitAreas: { index: number; area: NonNullable<HitArea> }[] = []
  private active: ActiveMotion | null = null
  private expression: ActiveExpression | null = null
  private look = { x: 0, y: 0 }
  private xf = { a: 1, b: 0, c: 1, d: 0 }
  private raf = 0
  private lastFrame = 0
  private nextBlinkAt = 0
  private blinkStart = -1
  private resizeObserver: ResizeObserver | null = null

  constructor(
    private readonly info: Pick<ModelInfo, 'id' | 'model3'>,
    options: Partial<PlaceholderOptions> = {}
  ) {
    this.options = { fpsLimit: 60, reduceMotion: false, ...options }
  }

  setOptions(options: Partial<PlaceholderOptions>): void {
    this.options = { ...this.options, ...options }
  }

  async mount(container: HTMLElement): Promise<void> {
    await this.dispose()
    try {
      const core = await loadCubismCore()
      const { id, model3 } = this.info
      const summary = inspectModel3(await fetchModelFile(id, model3, 'json'))
      this.summary = summary
      const mocBuffer = (await fetchModelFile(id, summary.moc, 'buffer')) as ArrayBuffer
      const moc = core.Moc.fromArrayBuffer(mocBuffer)
      if (!moc) throw new Error('moc3 를 Core 가 읽지 못했어요')
      this.moc = moc
      const model = core.Model.fromMoc(moc)
      if (!model) throw new Error('moc3 에서 모델을 만들지 못했어요')
      this.model = model
      this.base = Float32Array.from(model.parameters.defaultValues)
      model.parameters.ids.forEach((pid, i) => this.paramIndex.set(pid, i))

      const canvas = document.createElement('canvas')
      canvas.className = 'live2d-canvas'
      canvas.style.cssText = 'display:block;width:100%;height:100%'
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, stencil: true, antialias: true })
      if (!gl) throw new Error('WebGL 을 쓸 수 없어요')
      this.canvas = canvas
      this.gl = gl
      this.container = container
      container.appendChild(canvas)
      this.initGl(gl)
      this.textures = await Promise.all(summary.textures.map((t) => this.loadTexture(gl, modelFileUrl(id, t))))
      await this.loadClips(summary)
      if (summary.physics) this.physics = parsePhysics3(await fetchModelFile(id, summary.physics, 'json'))
      this.buildHitAreas(summary)

      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(container)
      this.resize()
      this.nextBlinkAt = performance.now() + 1500
      this.lastFrame = performance.now()
      this.raf = requestAnimationFrame(this.frame)
      // e2e(tests/e2e/live2d.cjs)가 파라미터 값을 읽는 훅
      ;(window as DebugWindow).__kmdLive2D = { param: this.paramAccess.get, physics: this.physics !== null }
    } catch (err) {
      await this.dispose()
      throw err
    }
  }

  async dispose(): Promise<void> {
    delete (window as DebugWindow).__kmdLive2D
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.active?.resolve(false)
    this.active = null
    this.expression = null
    const gl = this.gl
    if (gl) {
      for (const t of this.textures) gl.deleteTexture(t)
      for (const m of this.meshes) {
        gl.deleteBuffer(m.pos)
        gl.deleteBuffer(m.uv)
        gl.deleteBuffer(m.idx)
      }
      if (this.program) gl.deleteProgram(this.program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this.textures = []
    this.meshes = []
    this.program = null
    this.gl = null
    this.canvas?.remove()
    this.canvas = null
    this.container = null
    this.model?.release()
    this.model = null
    this.moc?.release()
    this.moc = null
    this.paramIndex.clear()
    this.hitAreas = []
    this.motions = {}
    this.expressions = {}
    this.physics = null
  }

  setEmotion(emotion: Emotion): void {
    const name = this.map.emotions[emotion] ?? Object.keys(this.expressions).find((k) => k.toLowerCase() === emotion)
    const data: ExpressionData =
      name && this.expressions[name]
        ? this.expressions[name]
        : { fadeIn: EMOTION_FADE_S, params: Object.entries(EMOTION_PARAMS[emotion] ?? {}).map(([id, value]) => ({ id, value, blend: 'Add' as const })) }
    this.expression = { data, start: performance.now() }
  }

  playMotion(motion: Motion, priority = 0): Promise<boolean> {
    if (this.active && this.active.priority > priority) return Promise.resolve(false)
    const group = this.resolveGroup(motion)
    const clips = group ? this.motions[group] : undefined
    if (!clips?.length) {
      if (motion === 'blink') this.blinkStart = performance.now()
      if (motion === 'idle' || motion === 'blink' || motion === 'look') {
        this.active?.resolve(false)
        this.active = null
        return Promise.resolve(true)
      }
      return Promise.resolve(false)
    }
    this.active?.resolve(false)
    const data = clips[Math.floor(Math.random() * clips.length)]
    return new Promise((resolve) => {
      this.active = { data, priority, start: performance.now(), resolve }
    })
  }

  setLookTarget(x: number, y: number): void {
    this.look = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
  }

  // 창 크기가 이미 scale을 반영하고 캔버스는 stage를 채우므로 별도 변환이 없다.
  setScale(): void {}

  hitTest(x: number, y: number): HitArea {
    const canvas = this.canvas
    const model = this.model
    if (!canvas || !model || !this.container) return null
    const rect = canvas.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null
    const mirrored = new DOMMatrix(getComputedStyle(this.container).transform).a < 0
    let lx = (x - rect.left) / rect.width
    if (mirrored) lx = 1 - lx
    const cx = lx * 2 - 1
    const cy = 1 - ((y - rect.top) / rect.height) * 2
    for (const { index, area } of this.hitAreas) {
      if (this.inBounds(index, cx, cy)) return area
    }
    if (this.hitAreas.length) return null
    const box = this.bounds((i) => (model.drawables.dynamicFlags[i] & FLAG_VISIBLE) !== 0 && model.drawables.opacities[i] > 0)
    if (!box || cx < box[0] || cx > box[2] || cy < box[1] || cy > box[3]) return null
    return cy > box[3] - (box[3] - box[1]) * 0.35 ? 'head' : 'body'
  }

  private async loadClips(summary: Model3Summary): Promise<void> {
    const { id } = this.info
    const mapRes = await fetch(modelFileUrl(id, MODEL_MAP_FILE)).catch(() => null)
    if (mapRes?.ok) {
      const raw = (await mapRes.json().catch(() => ({}))) as Partial<ModelMap>
      this.map = { motions: { ...raw.motions }, emotions: { ...raw.emotions } }
    }
    for (const [group, files] of Object.entries(summary.motions)) {
      this.motions[group] = await Promise.all(files.map(async (f) => parseMotion3(await fetchModelFile(id, f, 'json'))))
    }
    for (const [name, file] of Object.entries(summary.expressions)) {
      this.expressions[name] = parseExpression3(await fetchModelFile(id, file, 'json'))
    }
  }

  private buildHitAreas(summary: Model3Summary): void {
    const ids = this.model?.drawables.ids ?? []
    this.hitAreas = summary.hitAreas
      .map(({ id, name }) => ({ index: ids.indexOf(id), area: /head|face/i.test(name) ? ('head' as const) : ('body' as const) }))
      .filter((h) => h.index >= 0)
  }

  private resolveGroup(motion: Motion): string | undefined {
    const groups = Object.keys(this.motions)
    const mapped = this.map.motions[motion]
    if (mapped && this.motions[mapped]) return mapped
    const wanted = new Set([motion, ...MOTION_GROUP_ALIASES[motion]].map((s) => s.toLowerCase()))
    return groups.find((g) => wanted.has(g.toLowerCase()))
  }

  private initGl(gl: WebGLRenderingContext): void {
    const compile = (type: number, src: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('셰이더를 만들지 못했어요')
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`셰이더 컴파일 실패: ${gl.getShaderInfoLog(shader)}`)
      return shader
    }
    const program = gl.createProgram()
    if (!program) throw new Error('WebGL 프로그램을 만들지 못했어요')
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`셰이더 링크 실패: ${gl.getProgramInfoLog(program)}`)
    this.program = program
    this.loc = {
      pos: gl.getAttribLocation(program, 'a_pos'),
      uv: gl.getAttribLocation(program, 'a_uv'),
      xf: gl.getUniformLocation(program, 'u_xf'),
      opacity: gl.getUniformLocation(program, 'u_opacity')
    }
    gl.useProgram(program)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    const d = this.model!.drawables
    for (let i = 0; i < d.count; i++) {
      const pos = gl.createBuffer()
      const uv = gl.createBuffer()
      const idx = gl.createBuffer()
      if (!pos || !uv || !idx) throw new Error('버텍스 버퍼를 만들지 못했어요')
      gl.bindBuffer(gl.ARRAY_BUFFER, uv)
      gl.bufferData(gl.ARRAY_BUFFER, d.vertexUvs[i], gl.STATIC_DRAW)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.indices[i], gl.STATIC_DRAW)
      this.meshes.push({ pos, uv, idx })
    }
  }

  private async loadTexture(gl: WebGLRenderingContext, url: string): Promise<WebGLTexture> {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode().catch(() => {
      throw new Error(`텍스처를 읽지 못했어요: ${url.split('/').pop()}`)
    })
    const tex = gl.createTexture()
    if (!tex) throw new Error('텍스처를 만들지 못했어요')
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    const pot = (n: number): boolean => (n & (n - 1)) === 0
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    if (pot(img.width) && pot(img.height)) {
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    }
    return tex
  }

  // 모델 캔버스를 stage 안에 비율 유지로 맞춘다. 결과는 clip = model * (a, c) + (b, d).
  private resize(): void {
    const { canvas, model, container } = this
    if (!canvas || !model || !container) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(container.clientWidth * dpr))
    const h = Math.max(1, Math.round(container.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const { CanvasWidth, CanvasHeight, CanvasOriginX, CanvasOriginY, PixelsPerUnit } = model.canvasinfo
    const s = Math.min(w / CanvasWidth, h / CanvasHeight)
    this.xf = {
      a: (PixelsPerUnit * s * 2) / w,
      b: ((CanvasOriginX - CanvasWidth / 2) * s * 2) / w,
      c: (PixelsPerUnit * s * 2) / h,
      d: (-(CanvasOriginY - CanvasHeight / 2) * s * 2) / h
    }
  }

  private bounds(include: (i: number) => boolean): [number, number, number, number] | null {
    const d = this.model!.drawables
    let box: [number, number, number, number] | null = null
    for (let i = 0; i < d.count; i++) {
      if (!include(i)) continue
      const v = d.vertexPositions[i]
      for (let k = 0; k < v.length; k += 2) {
        const x = v[k] * this.xf.a + this.xf.b
        const y = v[k + 1] * this.xf.c + this.xf.d
        if (!box) box = [x, y, x, y]
        else {
          box[0] = Math.min(box[0], x)
          box[1] = Math.min(box[1], y)
          box[2] = Math.max(box[2], x)
          box[3] = Math.max(box[3], y)
        }
      }
    }
    return box
  }

  private inBounds(index: number, cx: number, cy: number): boolean {
    const box = this.bounds((i) => i === index)
    return !!box && cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3]
  }

  private paramAccess: ParamAccess = {
    get: (id) => {
      const i = this.paramIndex.get(id)
      return i === undefined ? undefined : this.model!.parameters.values[i]
    },
    range: (id) => {
      const i = this.paramIndex.get(id)
      const p = this.model!.parameters
      return i === undefined ? undefined : [p.minimumValues[i], p.maximumValues[i]]
    },
    set: (id, value) => {
      const i = this.paramIndex.get(id)
      if (i !== undefined) this.model!.parameters.values[i] = value
    }
  }

  private param(id: string, fn: (v: number) => number): void {
    const i = this.paramIndex.get(id)
    if (i === undefined) return
    const p = this.model!.parameters
    p.values[i] = fn(p.values[i])
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const interval = 1000 / this.options.fpsLimit
    if (now - this.lastFrame < interval - 1) return
    const dt = Math.min(100, now - this.lastFrame)
    this.lastFrame = now
    const model = this.model
    if (!model) return
    const p = model.parameters
    const { reduceMotion } = this.options

    // 1. 기준값: 모션이 쓰지 않는 파라미터는 기본값으로 천천히 복귀
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt / 150)
    for (let i = 0; i < this.base.length; i++) this.base[i] += (p.defaultValues[i] - this.base[i]) * k

    // 2. 모션 커브 (없으면 Idle 그룹 자동 반복)
    if (!this.active && !reduceMotion) {
      const idle = this.resolveGroup('idle')
      const clips = idle ? this.motions[idle] : undefined
      if (clips?.length) this.active = { data: clips[Math.floor(Math.random() * clips.length)], priority: -1, start: now, resolve: () => undefined }
    }
    if (this.active) {
      const { data, start } = this.active
      const elapsed = (now - start) / 1000
      if (!data.loop && elapsed >= data.duration) {
        this.active.resolve(true)
        this.active = null
      } else {
        const w = motionWeight(data, elapsed)
        const t = data.loop && data.duration > 0 ? elapsed % data.duration : elapsed
        for (const curve of data.curves) {
          const value = evaluateCurve(curve.segments, t)
          if (curve.target === 'Parameter') {
            const i = this.paramIndex.get(curve.id)
            if (i !== undefined) this.base[i] += (value - this.base[i]) * w
          } else if (curve.target === 'PartOpacity') {
            const i = model.parts.ids.indexOf(curve.id)
            if (i >= 0) model.parts.opacities[i] = value
          }
        }
      }
    }
    p.values.set(this.base)

    // 3. 표정
    if (this.expression) {
      const { data, start } = this.expression
      const w = data.fadeIn > 0 ? Math.min(1, (now - start) / 1000 / data.fadeIn) : 1
      for (const { id, value, blend } of data.params) {
        this.param(id, (v) => (blend === 'Add' ? v + value * w : blend === 'Multiply' ? v * (1 + (value - 1) * w) : v + (value - v) * w))
      }
    }

    // 4. 시선·호흡·깜빡임
    const { x: lx, y: ly } = this.look
    this.param('ParamAngleX', (v) => v + lx * 30)
    this.param('ParamAngleY', (v) => v - ly * 30)
    this.param('ParamEyeBallX', (v) => v + lx)
    this.param('ParamEyeBallY', (v) => v - ly)
    this.param('ParamBodyAngleX', (v) => v + lx * 10)
    if (!reduceMotion) {
      this.param('ParamBreath', () => Math.sin(now / 1400) * 0.5 + 0.5)
      if (now >= this.nextBlinkAt) {
        this.blinkStart = now
        this.nextBlinkAt = now + 2500 + Math.random() * 3500
      }
    }
    if (this.blinkStart >= 0) {
      const phase = (now - this.blinkStart) / BLINK_MS
      if (phase >= 1) this.blinkStart = -1
      else {
        const open = 1 - Math.sin(phase * Math.PI)
        for (const id of this.summary?.eyeBlinkIds ?? []) this.param(id, (v) => v * open)
      }
    }
    // 5. 물리(머리카락·술·꼬리 등): 고개·몸 각도를 입력으로 흔들림 파라미터를 덮어쓴다
    if (this.physics && !reduceMotion) stepPhysics(this.physics, this.paramAccess, dt / 1000)
    for (let i = 0; i < p.count; i++) p.values[i] = Math.max(p.minimumValues[i], Math.min(p.maximumValues[i], p.values[i]))

    model.update()
    this.draw()
    model.drawables.resetDynamicFlags()
  }

  private draw(): void {
    const { gl, model, canvas } = this
    if (!gl || !model || !canvas || gl.isContextLost()) return
    const d = model.drawables
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    gl.uniform4f(this.loc.xf, this.xf.a, this.xf.b, this.xf.c, this.xf.d)
    const order = Array.from({ length: d.count }, (_, i) => i).sort((a, b) => d.renderOrders[a] - d.renderOrders[b])
    for (const i of order) {
      if (!(d.dynamicFlags[i] & FLAG_VISIBLE) || d.opacities[i] <= 0) continue
      const masked = d.maskCounts[i] > 0
      if (masked) {
        // ponytail: 스텐실 하드 마스크. 공식 프레임워크의 소프트 마스크(오프스크린 알파)가 필요하면 교체
        gl.enable(gl.STENCIL_TEST)
        gl.clear(gl.STENCIL_BUFFER_BIT)
        gl.colorMask(false, false, false, false)
        gl.stencilFunc(gl.ALWAYS, 1, 0xff)
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
        for (const m of d.masks[i]) this.drawMesh(m, 1)
        gl.colorMask(true, true, true, true)
        gl.stencilFunc(d.constantFlags[i] & FLAG_INVERTED_MASK ? gl.NOTEQUAL : gl.EQUAL, 1, 0xff)
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
      }
      const flags = d.constantFlags[i]
      if (flags & FLAG_ADDITIVE) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE)
      else if (flags & FLAG_MULTIPLICATIVE) gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE)
      else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      this.drawMesh(i, d.opacities[i])
      if (masked) gl.disable(gl.STENCIL_TEST)
    }
  }

  private drawMesh(i: number, opacity: number): void {
    const gl = this.gl!
    const d = this.model!.drawables
    const mesh = this.meshes[i]
    const tex = this.textures[d.textureIndices[i]]
    if (!mesh || !tex) return
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos)
    gl.bufferData(gl.ARRAY_BUFFER, d.vertexPositions[i], gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.loc.pos)
    gl.vertexAttribPointer(this.loc.pos, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv)
    gl.enableVertexAttribArray(this.loc.uv)
    gl.vertexAttribPointer(this.loc.uv, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1f(this.loc.opacity, opacity)
    gl.drawElements(gl.TRIANGLES, d.indexCounts[i], gl.UNSIGNED_SHORT, 0)
  }
}
