// motion3.json / exp3.json 파서와 커브 평가. DOM·Core 의존 없음.

export interface MotionCurve {
  target: 'Parameter' | 'PartOpacity' | 'Model'
  id: string
  segments: number[]
}

export interface MotionData {
  duration: number
  loop: boolean
  fadeIn: number
  fadeOut: number
  curves: MotionCurve[]
}

export interface ExpressionParam {
  id: string
  value: number
  blend: 'Add' | 'Multiply' | 'Overwrite'
}

export interface ExpressionData {
  fadeIn: number
  params: ExpressionParam[]
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function parseMotion3(json: unknown): MotionData {
  const root = obj(json)
  const meta = obj(root.Meta)
  const curves: MotionCurve[] = []
  for (const raw of Array.isArray(root.Curves) ? root.Curves : []) {
    const c = obj(raw)
    const target = c.Target
    if ((target !== 'Parameter' && target !== 'PartOpacity' && target !== 'Model') || typeof c.Id !== 'string') continue
    const segments = Array.isArray(c.Segments) ? c.Segments.filter((n): n is number => typeof n === 'number') : []
    if (segments.length >= 2) curves.push({ target, id: c.Id, segments })
  }
  return {
    duration: Math.max(0, num(meta.Duration, 0)),
    loop: meta.Loop === true,
    fadeIn: Math.max(0, num(meta.FadeInTime, 1)),
    fadeOut: Math.max(0, num(meta.FadeOutTime, 1)),
    curves
  }
}

export function parseExpression3(json: unknown): ExpressionData {
  const root = obj(json)
  const params: ExpressionParam[] = []
  for (const raw of Array.isArray(root.Parameters) ? root.Parameters : []) {
    const p = obj(raw)
    if (typeof p.Id !== 'string') continue
    const blend = p.Blend === 'Multiply' || p.Blend === 'Overwrite' ? p.Blend : 'Add'
    params.push({ id: p.Id, value: num(p.Value, 0), blend })
  }
  return { fadeIn: Math.max(0, num(root.FadeInTime, 0.5)), params }
}

const SEGMENT_POINTS: Record<number, number> = { 0: 1, 1: 3, 2: 1, 3: 1 }

// Cubism 세그먼트 열: [t0, v0, type, ...points]. 베지어는 시간 비율을 매개변수로 쓰는 공식 프레임워크 방식 그대로.
export function evaluateCurve(segments: number[], time: number): number {
  let t0 = segments[0]
  let v0 = segments[1]
  let i = 2
  while (i < segments.length) {
    const type = segments[i]
    const points = SEGMENT_POINTS[type]
    if (!points || i + 1 + points * 2 > segments.length) break
    const tEnd = segments[i + 1 + (points - 1) * 2]
    const vEnd = segments[i + 2 + (points - 1) * 2]
    if (time <= tEnd) {
      if (type === 2) return v0
      if (type === 3) return vEnd
      const span = tEnd - t0
      const u = span > 0 ? Math.max(0, Math.min(1, (time - t0) / span)) : 1
      if (type === 0) return v0 + (vEnd - v0) * u
      const v1 = segments[i + 2]
      const v2 = segments[i + 4]
      const m = 1 - u
      return m * m * m * v0 + 3 * m * m * u * v1 + 3 * m * u * u * v2 + u * u * u * vEnd
    }
    t0 = tEnd
    v0 = vEnd
    i += 1 + points * 2
  }
  return v0
}

// 재생 시간 → 가중치(페이드 인·아웃). 루프 모션은 페이드 아웃하지 않는다.
export function motionWeight(motion: MotionData, elapsed: number): number {
  const fadeIn = motion.fadeIn > 0 ? Math.min(1, elapsed / motion.fadeIn) : 1
  if (motion.loop || motion.fadeOut <= 0) return fadeIn
  return Math.min(fadeIn, Math.max(0, Math.min(1, (motion.duration - elapsed) / motion.fadeOut)))
}
