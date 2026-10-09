import type { CharacterRenderer, Emotion, HitArea, Motion } from '@shared/types'

// 자체 제작 SVG 마스코트. Live2D 파라미터와 비슷하게 숫자 파라미터 → DOM 속성으로 그린다.
// 모든 수치는 viewBox(320x400) 좌표이며 setScale은 CSS transform으로만 처리한다.
export interface PlaceholderOptions {
  fpsLimit: 30 | 60
  reduceMotion: boolean
}

type Param =
  | 'headTilt'
  | 'headX'
  | 'headY'
  | 'eyeOpen'
  | 'eyeSmile'
  | 'browAngle'
  | 'browY'
  | 'smile'
  | 'mouthOpen'
  | 'cheek'
  | 'lookX'
  | 'lookY'
  | 'bodyStretch'
  | 'handRaise'
  | 'handAngle'

type Params = Record<Param, number>

const BASE: Params = {
  headTilt: 0,
  headX: 0,
  headY: 0,
  eyeOpen: 1,
  eyeSmile: 0,
  browAngle: 0,
  browY: 0,
  smile: 0.25,
  mouthOpen: 0,
  cheek: 0,
  lookX: 0,
  lookY: 0,
  bodyStretch: 0,
  handRaise: 0,
  handAngle: 0
}

const EMOTION_PRESETS: Record<Emotion, Partial<Params>> = {
  neutral: {},
  happy: { eyeSmile: 1, smile: 0.9, cheek: 1, browY: -2 },
  playful: { smile: 0.8, headTilt: 7, cheek: 0.6, browAngle: -4, eyeOpen: 0.85 },
  curious: { eyeOpen: 1.1, browY: -5, headTilt: -8, smile: 0.1, mouthOpen: 0.25 },
  concerned: { browAngle: 10, browY: -1, smile: -0.5, eyeOpen: 0.9 },
  sleepy: { eyeOpen: 0.35, browY: 2, smile: 0.1, headTilt: 5, headY: 4 },
  annoyed: { browAngle: -12, eyeOpen: 0.7, smile: -0.4 }
}

// [진행률 0..1, 오프셋]. 오프셋은 감정 기본값 위에 더해진다.
type Track = [number, number][]
interface MotionClip {
  duration: number
  tracks: Partial<Record<Param, Track>>
}

const CLIPS: Record<Motion, MotionClip> = {
  idle: { duration: 0, tracks: {} },
  blink: { duration: 180, tracks: { eyeOpen: [[0, 0], [0.4, -1], [0.6, -1], [1, 0]] } },
  look: { duration: 1600, tracks: { lookX: [[0, 0], [0.2, 0.9], [0.65, 0.9], [1, 0]], headTilt: [[0, 0], [0.3, 3], [1, 0]] } },
  greet: {
    duration: 1000,
    tracks: { headY: [[0, 0], [0.35, 8], [0.7, 8], [1, 0]], smile: [[0, 0], [0.3, 0.6], [1, 0]], eyeSmile: [[0, 0], [0.3, 1], [0.8, 1], [1, 0]] }
  },
  wave: {
    duration: 1500,
    tracks: {
      handRaise: [[0, 0], [0.2, 1], [0.85, 1], [1, 0]],
      handAngle: [[0, 0], [0.3, -18], [0.45, 18], [0.6, -18], [0.75, 18], [0.9, 0]],
      smile: [[0, 0], [0.2, 0.5], [1, 0]]
    }
  },
  headTilt: { duration: 1400, tracks: { headTilt: [[0, 0], [0.3, 12], [0.7, 12], [1, 0]], lookX: [[0, 0], [0.3, -0.3], [1, 0]] } },
  stretch: {
    duration: 1600,
    tracks: { bodyStretch: [[0, 0], [0.4, 1], [0.7, 1], [1, 0]], eyeOpen: [[0, 0], [0.3, -1], [0.8, -1], [1, 0]], headY: [[0, 0], [0.4, -6], [1, 0]] }
  },
  yawn: {
    duration: 1800,
    tracks: { mouthOpen: [[0, 0], [0.3, 1], [0.7, 1], [1, 0]], eyeOpen: [[0, 0], [0.3, -0.8], [0.8, -0.8], [1, 0]], headTilt: [[0, 0], [0.4, -6], [1, 0]] }
  },
  reactTap: {
    duration: 550,
    tracks: { headY: [[0, 0], [0.25, -10], [0.6, 3], [1, 0]], eyeOpen: [[0, 0], [0.2, 0.3], [1, 0]], mouthOpen: [[0, 0], [0.2, 0.4], [1, 0]] }
  },
  rest: { duration: 2400, tracks: { eyeOpen: [[0, 0], [0.4, -0.7], [1, -0.7]], headTilt: [[0, 0], [0.5, 6], [1, 6]], headY: [[0, 0], [0.5, 5], [1, 5]] } }
}

interface ActiveMotion {
  clip: MotionClip
  priority: number
  start: number
  resolve: (finished: boolean) => void
}

const VIEW = { width: 320, height: 400 }
const EYES = { left: 133, right: 187, y: 168 } as const
const BLINK_INTERVAL = { min: 2500, max: 6000 }
const SVG_NS = 'http://www.w3.org/2000/svg'

export function sampleTrack(track: Track, t: number): number {
  if (t <= track[0][0]) return track[0][1]
  for (let i = 1; i < track.length; i++) {
    const [t1, v1] = track[i]
    if (t <= t1) {
      const [t0, v0] = track[i - 1]
      const k = (t - t0) / (t1 - t0)
      const eased = k * k * (3 - 2 * k)
      return v0 + (v1 - v0) * eased
    }
  }
  return track[track.length - 1][1]
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  parent?.appendChild(node)
  return node
}

export class PlaceholderRenderer implements CharacterRenderer {
  private options: PlaceholderOptions
  private svg: SVGSVGElement | null = null
  private nodes: Record<string, SVGElement> = {}
  private base: Params = { ...BASE }
  private current: Params = { ...BASE }
  private emotion: Emotion = 'neutral'
  private motion: ActiveMotion | null = null
  private look = { x: 0, y: 0 }
  private scale = 1
  private raf = 0
  private lastFrame = 0
  private nextBlinkAt = 0

  constructor(options: Partial<PlaceholderOptions> = {}) {
    this.options = { fpsLimit: 60, reduceMotion: false, ...options }
  }

  setOptions(options: Partial<PlaceholderOptions>): void {
    this.options = { ...this.options, ...options }
  }

  async mount(container: HTMLElement): Promise<void> {
    await this.dispose()
    this.svg = this.build()
    this.applyScale()
    container.appendChild(this.svg)
    this.nextBlinkAt = performance.now() + 1500
    this.raf = requestAnimationFrame(this.frame)
  }

  async dispose(): Promise<void> {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.motion?.resolve(false)
    this.motion = null
    this.svg?.remove()
    this.svg = null
    this.nodes = {}
  }

  setEmotion(emotion: Emotion): void {
    this.emotion = emotion in EMOTION_PRESETS ? emotion : 'neutral'
  }

  playMotion(motion: Motion, priority = 0): Promise<boolean> {
    const clip = CLIPS[motion] ?? CLIPS.idle
    if (clip.duration === 0) return Promise.resolve(true)
    if (this.motion && this.motion.priority > priority) return Promise.resolve(false)
    this.motion?.resolve(false)
    return new Promise((resolve) => {
      this.motion = { clip, priority, start: performance.now(), resolve }
    })
  }

  // -1..1 정규화 좌표. 캐릭터 중심 기준으로 왼쪽/위가 음수.
  setLookTarget(x: number, y: number): void {
    this.look = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
  }

  setScale(scale: number): void {
    this.scale = scale
    this.applyScale()
  }

  hitTest(x: number, y: number): HitArea {
    const target = document.elementFromPoint(x, y)
    const hit = target?.closest('[data-hit]')?.getAttribute('data-hit')
    return hit === 'head' || hit === 'body' ? hit : null
  }

  private applyScale(): void {
    if (!this.svg) return
    this.svg.style.transform = this.scale === 1 ? '' : `scale(${this.scale})`
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const interval = 1000 / this.options.fpsLimit
    if (now - this.lastFrame < interval - 1) return
    const dt = Math.min(100, now - (this.lastFrame || now))
    this.lastFrame = now
    this.update(now, dt)
    this.draw(now)
  }

  private update(now: number, dt: number): void {
    const target: Params = { ...BASE, ...EMOTION_PRESETS[this.emotion] }
    target.lookX += this.look.x
    target.lookY += this.look.y

    if (!this.motion && now >= this.nextBlinkAt && !this.options.reduceMotion) {
      void this.playMotion('blink', -1)
      this.nextBlinkAt = now + BLINK_INTERVAL.min + Math.random() * (BLINK_INTERVAL.max - BLINK_INTERVAL.min)
    }

    // base는 감정 목표로 부드럽게 수렴하고, 모션 오프셋은 매 프레임 새로 더한다(누적 방지).
    const smoothing = this.options.reduceMotion ? 1 : 1 - Math.exp(-dt / 120)
    for (const key of Object.keys(this.base) as Param[]) {
      this.base[key] += (target[key] - this.base[key]) * smoothing
      this.current[key] = this.base[key]
    }

    if (this.motion) {
      const t = (now - this.motion.start) / this.motion.clip.duration
      const progress = Math.min(1, t)
      for (const [key, track] of Object.entries(this.motion.clip.tracks) as [Param, Track][]) {
        this.current[key] += sampleTrack(track, progress)
      }
      if (t >= 1) {
        this.motion.resolve(true)
        this.motion = null
        this.nextBlinkAt = Math.max(this.nextBlinkAt, now + 400)
      }
    }
  }

  private draw(now: number): void {
    const p = this.current
    const n = this.nodes
    const breath = this.options.reduceMotion ? 0 : Math.sin(now / 1400) * 0.5 + 0.5
    const eyeOpen = Math.max(0, Math.min(1.2, p.eyeOpen))
    const lookX = p.lookX * 5
    const lookY = p.lookY * 4

    n.body.setAttribute(
      'transform',
      `translate(0 ${breath * 2}) translate(160 400) scale(1 ${1 + p.bodyStretch * 0.04}) translate(-160 -400)`
    )
    n.head.setAttribute(
      'transform',
      `translate(${p.headX + lookX * 0.6} ${p.headY + breath * 1.5 + lookY * 0.4}) rotate(${p.headTilt} 160 225)`
    )
    n.hand.setAttribute('transform', `translate(0 ${(1 - p.handRaise) * 90}) rotate(${p.handAngle} 258 262)`)
    n.hand.setAttribute('opacity', String(p.handRaise))

    for (const side of ['left', 'right'] as const) {
      const cx = EYES[side]
      const ry = Math.max(0.01, 15 * eyeOpen)
      n[`${side}EyeClip`].setAttribute('ry', String(ry))
      n[`${side}EyeWhite`].setAttribute('ry', String(ry))
      n[`${side}Iris`].setAttribute('transform', `translate(${lookX} ${lookY})`)
      n[`${side}Lash`].setAttribute('d', `M${cx - 13} ${EYES.y} Q${cx} ${EYES.y - ry * 1.3} ${cx + 13} ${EYES.y}`)
      n[`${side}EyeOpen`].setAttribute('opacity', String(1 - p.eyeSmile))
      n[`${side}EyeSmile`].setAttribute('opacity', String(p.eyeSmile))
      const browDir = side === 'left' ? 1 : -1
      n[`${side}Brow`].setAttribute('transform', `translate(0 ${p.browY}) rotate(${p.browAngle * browDir} ${cx} 145)`)
      n[`${side}Cheek`].setAttribute('opacity', String(p.cheek * 0.7))
    }

    const open = Math.max(0, p.mouthOpen)
    const lower = 200 + p.smile * 10 + open * 16
    const upper = 200 + p.smile * 2 - open * 2
    n.mouth.setAttribute('d', `M148 200 Q160 ${lower} 172 200 Q160 ${upper} 148 200 Z`)
  }

  private build(): SVGSVGElement {
    const svg = el('svg', {
      viewBox: `0 0 ${VIEW.width} ${VIEW.height}`,
      width: '100%',
      height: '100%',
      role: 'img',
      'aria-label': 'Kirikomodo 플레이스홀더 캐릭터'
    })
    svg.classList.add('placeholder-character')
    const defs = el('defs', {}, svg)
    for (const side of ['left', 'right'] as const) {
      const clip = el('clipPath', { id: `${side}-eye-clip` }, defs)
      this.nodes[`${side}EyeClip`] = el('ellipse', { cx: EYES[side], cy: EYES.y, rx: 13, ry: 15 }, clip)
    }

    const body = el('g', { 'data-hit': 'body' }, svg)
    this.nodes.body = body
    el('path', { d: 'M85 400 L85 300 Q85 240 125 228 L160 246 L195 228 Q235 240 235 300 L235 400 Z', fill: '#fbfbfb', stroke: '#d9d9d9', 'stroke-width': 2 }, body)
    el('path', { d: 'M125 228 L160 262 L195 228', fill: 'none', stroke: '#c8362f', 'stroke-width': 9, 'stroke-linejoin': 'round' }, body)
    el('path', { d: 'M135 232 L160 256 L185 232', fill: 'none', stroke: '#fbfbfb', 'stroke-width': 3 }, body)
    el('ellipse', { cx: 97, cy: 262, rx: 20, ry: 26, fill: '#fbfbfb', stroke: '#d9d9d9', 'stroke-width': 2 }, body)
    el('ellipse', { cx: 223, cy: 262, rx: 20, ry: 26, fill: '#fbfbfb', stroke: '#d9d9d9', 'stroke-width': 2 }, body)
    el('circle', { cx: 196, cy: 292, r: 7, fill: 'none', stroke: '#c8362f', 'stroke-width': 3 }, body)
    el('rect', { x: 85, y: 330, width: 150, height: 16, fill: '#c8362f' }, body)
    for (let i = 0; i < 6; i++) {
      el('circle', { cx: 100 + i * 24, cy: 338, r: 7, fill: '#f3f3f3', stroke: '#d0d0d0', 'stroke-width': 1.5 }, body)
    }

    const hand = el('g', {}, svg)
    this.nodes.hand = hand
    el('rect', { x: 246, y: 262, width: 24, height: 44, rx: 10, fill: '#f5d6c0' }, hand)
    el('circle', { cx: 258, cy: 258, r: 15, fill: '#f5d6c0' }, hand)
    el('rect', { x: 243, y: 270, width: 30, height: 14, rx: 6, fill: '#c8362f' }, hand)

    const head = el('g', { 'data-hit': 'head' }, svg)
    this.nodes.head = head
    el('ellipse', { cx: 160, cy: 150, rx: 84, ry: 88, fill: '#2b4a48' }, head)
    el('path', { d: 'M196 70 Q230 40 236 78 Q222 72 214 88 Z', fill: '#2b4a48' }, head)
    el('circle', { cx: 160, cy: 160, r: 72, fill: '#f8dcc8' }, head)
    el('path', { d: 'M92 140 Q86 190 112 214 L108 150 Z', fill: '#2b4a48' }, head)
    el('path', { d: 'M228 140 Q234 190 208 214 L212 150 Z', fill: '#2b4a48' }, head)
    el('path', { d: 'M90 142 Q118 112 150 150 Q166 118 196 150 Q216 124 230 142 L230 118 Q160 88 90 118 Z', fill: '#2b4a48' }, head)
    el('path', { d: 'M102 96 L116 46 L144 86 Z', fill: '#c8362f' }, head)
    el('path', { d: 'M110 92 L118 60 L136 86 Z', fill: '#e6655d' }, head)
    el('path', { d: 'M218 96 L204 46 L176 86 Z', fill: '#c8362f' }, head)
    el('path', { d: 'M210 92 L202 60 L184 86 Z', fill: '#e6655d' }, head)
    el('path', { d: 'M90 120 Q160 82 230 120 L230 134 Q160 98 90 134 Z', fill: '#c8362f' }, head)
    el('rect', { x: 150, y: 101, width: 20, height: 18, rx: 3, fill: '#fbe9e7', opacity: 0.9 }, head)

    for (const side of ['left', 'right'] as const) {
      const cx = EYES[side]
      const cheekX = side === 'left' ? cx - 14 : cx + 14
      this.nodes[`${side}Cheek`] = el('ellipse', { cx: cheekX, cy: 188, rx: 12, ry: 6, fill: '#f4a6a0', opacity: 0 }, head)
      const open = el('g', {}, head)
      this.nodes[`${side}EyeOpen`] = open
      this.nodes[`${side}EyeWhite`] = el('ellipse', { cx, cy: EYES.y, rx: 13, ry: 15, fill: '#ffffff' }, open)
      const inner = el('g', { 'clip-path': `url(#${side}-eye-clip)` }, open)
      const iris = el('g', {}, inner)
      this.nodes[`${side}Iris`] = iris
      el('circle', { cx, cy: EYES.y + 1, r: 9, fill: '#3a2a28' }, iris)
      el('circle', { cx, cy: EYES.y + 1, r: 4.5, fill: '#1a1210' }, iris)
      el('circle', { cx: cx - 3, cy: EYES.y - 3, r: 2.6, fill: '#ffffff' }, iris)
      this.nodes[`${side}Lash`] = el('path', { d: '', fill: 'none', stroke: '#2b2b2b', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, open)
      this.nodes[`${side}EyeSmile`] = el('path', {
        d: `M${cx - 13} ${EYES.y + 3} Q${cx} ${EYES.y - 14} ${cx + 13} ${EYES.y + 3}`,
        fill: 'none',
        stroke: '#2b2b2b',
        'stroke-width': 3,
        'stroke-linecap': 'round',
        opacity: 0
      }, head)
      this.nodes[`${side}Brow`] = el('path', {
        d: `M${cx - 12} 146 Q${cx} 141 ${cx + 12} 146`,
        fill: 'none',
        stroke: '#2b4a48',
        'stroke-width': 3,
        'stroke-linecap': 'round'
      }, head)
    }
    el('path', { d: 'M118 180 L124 184', stroke: '#c8362f', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, head)
    el('path', { d: 'M202 180 L196 184', stroke: '#c8362f', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, head)
    this.nodes.mouth = el('path', { d: '', fill: '#b23a32', stroke: '#8a2a24', 'stroke-width': 2, 'stroke-linejoin': 'round' }, head)
    return svg
  }
}
