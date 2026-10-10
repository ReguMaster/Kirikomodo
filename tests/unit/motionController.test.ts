import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOTION_COOLDOWN_MS, MOTION_PRIORITY, MotionController } from '@/character/MotionController'
import type { CharacterRenderer, Emotion, Motion } from '@shared/types'

// playMotion 계약을 흉내 내는 렌더러: 높은 우선순위만 교체, 이전 promise는 false.
function fakeRenderer() {
  const calls: [Motion, number][] = []
  const emotions: Emotion[] = []
  let active: { priority: number; resolve: (v: boolean) => void } | null = null
  const renderer: CharacterRenderer = {
    mount: async () => {},
    dispose: async () => {},
    setEmotion: (e) => void emotions.push(e),
    playMotion: (motion, priority = 0) => {
      calls.push([motion, priority])
      if (active && active.priority > priority) return Promise.resolve(false)
      active?.resolve(false)
      if (motion === 'idle') {
        active = null
        return Promise.resolve(true)
      }
      return new Promise((resolve) => {
        active = { priority, resolve }
      })
    },
    setLookTarget: () => {},
    setScale: () => {},
    hitTest: () => null
  }
  const finish = (): void => {
    active?.resolve(true)
    active = null
  }
  return { renderer, calls, emotions, finish }
}

describe('MotionController', () => {
  let now = 0
  beforeEach(() => {
    now = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('우선순위 상수는 수동 > 대화 > 자율 > 대기 순서다', () => {
    expect(MOTION_PRIORITY.manual).toBeGreaterThan(MOTION_PRIORITY.dialogue)
    expect(MOTION_PRIORITY.dialogue).toBeGreaterThan(MOTION_PRIORITY.autonomous)
    expect(MOTION_PRIORITY.autonomous).toBeGreaterThan(MOTION_PRIORITY.idle)
  })

  it('낮은 소스는 진행 중인 높은 모션을 끊지 못하고, 높은 소스는 인터럽트한다', async () => {
    const f = fakeRenderer()
    const c = new MotionController(f.renderer, () => now)
    const manual = c.play('reactTap', 'manual')
    await expect(c.play('wave', 'autonomous')).resolves.toBe(false)
    expect(f.calls).toHaveLength(1)
    expect(c.current?.motion).toBe('reactTap')

    const auto = c.play('greet', 'autonomous')
    f.finish()
    await expect(manual).resolves.toBe(true)
    await expect(auto).resolves.toBe(false)
    expect(c.current).toBeNull()

    const low = c.play('headTilt', 'autonomous')
    const high = c.play('wave', 'dialogue')
    await expect(low).resolves.toBe(false)
    expect(c.current?.motion).toBe('wave')
    f.finish()
    await expect(high).resolves.toBe(true)
  })

  it('같은 모션이 진행 중이면 다시 재생하지 않는다', async () => {
    const f = fakeRenderer()
    const c = new MotionController(f.renderer, () => now)
    void c.play('reactTap', 'manual')
    await expect(c.play('reactTap', 'manual')).resolves.toBe(false)
    expect(f.calls).toHaveLength(1)
  })

  it('쿨다운은 수동이 아닌 소스에만 적용된다', async () => {
    const f = fakeRenderer()
    const c = new MotionController(f.renderer, () => now)
    void c.play('wave', 'autonomous')
    f.finish()
    await Promise.resolve()
    now += 10
    await expect(c.play('wave', 'autonomous')).resolves.toBe(false)
    void c.play('wave', 'manual')
    f.finish()
    now += MOTION_COOLDOWN_MS.wave
    expect(c.isReady('wave')).toBe(true)
    expect(f.calls.map(([m]) => m)).toEqual(['wave', 'wave'])
  })

  it('무효 모션·감정은 idle·neutral로 폴백한다', async () => {
    const f = fakeRenderer()
    const c = new MotionController(f.renderer, () => now)
    await expect(c.play('explode' as Motion, 'manual')).resolves.toBe(true)
    expect(f.calls[0][0]).toBe('idle')
    c.express('rage' as Emotion)
    expect(f.emotions).toEqual(['neutral'])
  })

  it('감정은 지속시간이 지나면 neutral로 돌아오고 0이면 유지된다', () => {
    const f = fakeRenderer()
    const c = new MotionController(f.renderer, () => now)
    c.express('happy')
    expect(c.currentEmotion).toBe('happy')
    vi.advanceTimersByTime(2499)
    expect(c.currentEmotion).toBe('happy')
    vi.advanceTimersByTime(1)
    expect(c.currentEmotion).toBe('neutral')
    c.express('sleepy', 0)
    vi.advanceTimersByTime(60_000)
    expect(c.currentEmotion).toBe('sleepy')
  })

  it('cancel은 진행 중 모션을 idle로 끊는다', async () => {
    const f = fakeRenderer()
    const c = new MotionController(f.renderer, () => now)
    const p = c.play('stretch', 'autonomous')
    c.cancel()
    await expect(p).resolves.toBe(false)
    expect(c.current).toBeNull()
  })
})
