import { describe, expect, it } from 'vitest'
import {
  BEHAVIOR_TIMING,
  BehaviorEngine,
  getTimeOfDay,
  isWithinQuietHours,
  pickWeighted,
  type IdleActionPayload
} from '@/core/BehaviorEngine'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { CompanionEvent } from '@shared/types'

const DAY = DEFAULT_SETTINGS.behavior.timeOfDay
const at = (h: number, m = 0): Date => new Date(2026, 9, 10, h, m)

describe('getTimeOfDay / isWithinQuietHours', () => {
  it('시간대 프리셋 경계를 따른다', () => {
    expect(getTimeOfDay(at(6), DAY)).toBe('morning')
    expect(getTimeOfDay(at(10, 59), DAY)).toBe('morning')
    expect(getTimeOfDay(at(11), DAY)).toBe('day')
    expect(getTimeOfDay(at(18), DAY)).toBe('evening')
    expect(getTimeOfDay(at(23), DAY)).toBe('night')
    expect(getTimeOfDay(at(2), DAY)).toBe('night')
  })

  it('자정을 넘는 방해 금지 시간을 처리한다', () => {
    const quiet = { enabled: true, start: '23:00', end: '08:00' }
    expect(isWithinQuietHours(at(23, 30), quiet)).toBe(true)
    expect(isWithinQuietHours(at(7, 59), quiet)).toBe(true)
    expect(isWithinQuietHours(at(8), quiet)).toBe(false)
    expect(isWithinQuietHours(at(12), { ...quiet, enabled: false })).toBe(false)
  })
})

describe('pickWeighted', () => {
  const pool = [
    { motion: 'look' as const, weight: 1 },
    { motion: 'wave' as const, weight: 3 }
  ]
  it('가중치 구간에 따라 고르고 직전 모션은 제외한다', () => {
    expect(pickWeighted(pool, () => 0.1, null).motion).toBe('look')
    expect(pickWeighted(pool, () => 0.9, null).motion).toBe('wave')
    expect(pickWeighted(pool, () => 0.9, 'wave').motion).toBe('look')
  })
})

function setup(start: Date, random = () => 0) {
  const events: CompanionEvent[] = []
  let now = start.getTime()
  const engine = new BehaviorEngine((e) => events.push(e), () => now, random)
  engine.configure({ ...DEFAULT_SETTINGS.behavior, quietHours: { ...DEFAULT_SETTINGS.behavior.quietHours, enabled: false } })
  events.length = 0
  engine.start()
  engine.stop()
  const advance = (ms: number): void => {
    const end = now + ms
    while (now < end) {
      now = Math.min(end, now + BEHAVIOR_TIMING.tickMs)
      engine.tick(now)
    }
  }
  const idle = (): IdleActionPayload[] => events.filter((e) => e.type === 'IDLE_ACTION').map((e) => e.payload as IdleActionPayload)
  return { engine, events, advance, idle, setNow: (d: Date) => (now = d.getTime()) }
}

describe('BehaviorEngine', () => {
  it('유휴 시 짧은 행동과 큰 행동을 예약하고 시간대 풀을 쓴다', () => {
    const s = setup(at(14))
    expect(s.events.map((e) => e.type)).toEqual([])
    s.advance(BEHAVIOR_TIMING.smallActionMs.min)
    expect(s.events[0].type).toBe('TIME_TICK')
    expect(s.idle().map((p) => p.kind)).toEqual(['small'])
    s.advance(BEHAVIOR_TIMING.bigActionMs.min)
    const big = s.idle().filter((p) => p.kind === 'big')
    expect(big).toHaveLength(1)
    expect(big[0].timeOfDay).toBe('day')
    expect(['wave', 'greet', 'headTilt', 'stretch']).toContain(big[0].motion)
  })

  it('같은 모션을 연속으로 뽑지 않는다', () => {
    const s = setup(at(14))
    s.advance(BEHAVIOR_TIMING.bigActionMs.min * 4)
    const motions = s.idle().map((p) => p.motion)
    expect(motions.length).toBeGreaterThan(3)
    for (let i = 1; i < motions.length; i++) expect(motions[i]).not.toBe(motions[i - 1])
  })

  it('방해 금지·숨김·상호작용 중에는 자율 행동을 내지 않는다', () => {
    const s = setup(at(14))
    s.engine.setState('INTERACTING')
    s.advance(BEHAVIOR_TIMING.bigActionMs.max)
    expect(s.idle()).toHaveLength(0)
    s.engine.setState('IDLE')
    s.engine.configure({ ...DEFAULT_SETTINGS.behavior, doNotDisturb: true })
    s.advance(BEHAVIOR_TIMING.bigActionMs.max)
    expect(s.idle()).toHaveLength(0)
    expect(s.events.filter((e) => e.type === 'PROACTIVE_DIALOGUE')).toHaveLength(0)
  })

  it('조용한 시간에는 큰 행동이 휴식 풀로 바뀌고 선제 발화가 막힌다', () => {
    const s = setup(at(14))
    s.engine.configure({ ...DEFAULT_SETTINGS.behavior, quietHours: { enabled: true, start: '13:00', end: '15:00' } })
    s.advance(BEHAVIOR_TIMING.bigActionMs.max)
    const big = s.idle().filter((p) => p.kind === 'big')
    expect(big.length).toBeGreaterThan(0)
    for (const p of big) expect(['rest', 'yawn']).toContain(p.motion)
    expect(s.events.filter((e) => e.type === 'PROACTIVE_DIALOGUE')).toHaveLength(0)
  })

  it('선제 발화는 유예 시간·최소 간격·하루 횟수를 지킨다', () => {
    const s = setup(at(9))
    const proactive = () => s.events.filter((e) => e.type === 'PROACTIVE_DIALOGUE')
    s.engine.noteUserInteraction()
    s.advance(BEHAVIOR_TIMING.interactionGraceMs - 1000)
    expect(proactive()).toHaveLength(0)
    s.advance(2000)
    expect(proactive()).toHaveLength(1)
    s.advance(89 * 60_000)
    expect(proactive()).toHaveLength(1)
    s.advance(2 * 60_000)
    expect(proactive()).toHaveLength(2)
    s.advance(6 * 60 * 60_000)
    expect(proactive()).toHaveLength(3)
    s.setNow(at(23, 59))
    s.advance(10 * 60_000)
    expect(proactive()).toHaveLength(4)
    expect(s.events.filter((e) => e.type === 'TIME_TICK').map((e) => (e.payload as { timeOfDay: string }).timeOfDay)).toEqual([
      'morning',
      'day',
      'night'
    ])
  })

  it('절전 복귀처럼 큰 공백 뒤에는 밀린 이벤트를 쏟지 않고 다시 예약한다', () => {
    const s = setup(at(14))
    s.advance(5000)
    s.setNow(at(16))
    s.engine.tick(at(16).getTime())
    expect(s.idle()).toHaveLength(0)
    s.advance(BEHAVIOR_TIMING.smallActionMs.min - 1000)
    expect(s.idle()).toHaveLength(0)
    s.advance(2000)
    expect(s.idle()).toHaveLength(1)
  })
})
