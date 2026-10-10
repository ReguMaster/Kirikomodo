import type { CompanionEvent, Emotion, Motion, TimeOfDay } from '@shared/types'
import type { Settings } from '@shared/settings'

// FR-005 자율 행동 스케줄러. 렌더 프레임과 무관한 1초 tick으로 돌며, 결정 결과를 CompanionEvent로만 발행한다.
// 시계·난수는 주입 가능해서 테스트는 tick(now)를 직접 호출한다.

export type BehaviorState = 'IDLE' | 'INTERACTING' | 'CHATTING' | 'RESTING' | 'HIDDEN'
export type BehaviorSettings = Settings['behavior']

export interface IdleActionPayload {
  kind: 'small' | 'big'
  motion: Motion
  emotion?: Emotion
  timeOfDay: TimeOfDay
}

export interface ProactivePayload {
  timeOfDay: TimeOfDay
}

interface Range {
  min: number
  max: number
}

// 초기값(명세). 초 단위 짧은 동작, 분 단위 큰 동작, 상호작용 뒤 선제 발화 금지 시간.
export const BEHAVIOR_TIMING = {
  smallActionMs: { min: 10_000, max: 40_000 } as Range,
  bigActionMs: { min: 60_000, max: 300_000 } as Range,
  interactionGraceMs: 5 * 60_000,
  tickMs: 1000,
  // tick 간격이 이보다 크면 절전 복귀로 보고 밀린 이벤트를 버리고 다시 예약한다.
  resumeGapMs: 10_000
}

type Weighted = { motion: Motion; weight: number; emotion?: Emotion }

const SMALL_POOL: Weighted[] = [
  { motion: 'look', weight: 5 },
  { motion: 'headTilt', weight: 3 },
  { motion: 'blink', weight: 2 }
]

const BIG_POOLS: Record<TimeOfDay, Weighted[]> = {
  morning: [
    { motion: 'stretch', weight: 4, emotion: 'sleepy' },
    { motion: 'greet', weight: 3, emotion: 'happy' },
    { motion: 'yawn', weight: 2, emotion: 'sleepy' },
    { motion: 'wave', weight: 1, emotion: 'happy' }
  ],
  day: [
    { motion: 'wave', weight: 3, emotion: 'happy' },
    { motion: 'greet', weight: 3, emotion: 'playful' },
    { motion: 'headTilt', weight: 3, emotion: 'curious' },
    { motion: 'stretch', weight: 1 }
  ],
  evening: [
    { motion: 'headTilt', weight: 3, emotion: 'curious' },
    { motion: 'stretch', weight: 3 },
    { motion: 'wave', weight: 2, emotion: 'happy' },
    { motion: 'yawn', weight: 2, emotion: 'sleepy' }
  ],
  night: [
    { motion: 'yawn', weight: 4, emotion: 'sleepy' },
    { motion: 'rest', weight: 4, emotion: 'sleepy' },
    { motion: 'stretch', weight: 2, emotion: 'sleepy' }
  ]
}

const REST_POOL: Weighted[] = [
  { motion: 'rest', weight: 5, emotion: 'sleepy' },
  { motion: 'yawn', weight: 2, emotion: 'sleepy' }
]

export const DEFAULT_TIME_OF_DAY: BehaviorSettings['timeOfDay'] = { morning: 6, day: 11, evening: 18, night: 23 }

export function getTimeOfDay(date: Date, hours: BehaviorSettings['timeOfDay'] = DEFAULT_TIME_OF_DAY): TimeOfDay {
  const h = date.getHours()
  const inRange = (start: number, end: number): boolean => (start < end ? h >= start && h < end : h >= start || h < end)
  if (inRange(hours.morning, hours.day)) return 'morning'
  if (inRange(hours.day, hours.evening)) return 'day'
  if (inRange(hours.evening, hours.night)) return 'evening'
  return 'night'
}

export function isWithinQuietHours(date: Date, quiet: BehaviorSettings['quietHours']): boolean {
  if (!quiet.enabled) return false
  const toMin = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
  const now = date.getHours() * 60 + date.getMinutes()
  const start = toMin(quiet.start)
  const end = toMin(quiet.end)
  if (start === end) return false
  return start < end ? now >= start && now < end : now >= start || now < end
}

// 가중치 추첨. 직전 모션은 후보에서 빼서 같은 동작이 연달아 나오지 않게 한다(후보가 하나뿐이면 허용).
export function pickWeighted(pool: readonly Weighted[], random: () => number, exclude: Motion | null): Weighted {
  const candidates = pool.length > 1 ? pool.filter((w) => w.motion !== exclude) : pool
  const total = candidates.reduce((sum, w) => sum + w.weight, 0)
  let roll = random() * total
  for (const w of candidates) {
    roll -= w.weight
    if (roll < 0) return w
  }
  return candidates[candidates.length - 1]
}

function randomIn(range: Range, random: () => number): number {
  return range.min + random() * (range.max - range.min)
}

export class BehaviorEngine {
  private settings: BehaviorSettings | null = null
  private state: BehaviorState = 'IDLE'
  private timer: ReturnType<typeof setInterval> | null = null
  private lastTick = 0
  private nextSmallAt = 0
  private nextBigAt = 0
  private lastMotion: Motion | null = null
  private lastInteractionAt = 0
  private lastProactiveAt = 0
  private proactiveDay = ''
  private proactiveCount = 0
  private timeOfDay: TimeOfDay | null = null
  private seq = 0

  constructor(
    private readonly emit: (event: CompanionEvent) => void,
    private readonly now: () => number = () => Date.now(),
    private readonly random: () => number = Math.random
  ) {}

  get currentState(): BehaviorState {
    return this.state
  }

  get currentTimeOfDay(): TimeOfDay {
    return getTimeOfDay(new Date(this.now()), this.settings?.timeOfDay)
  }

  configure(settings: BehaviorSettings): void {
    this.settings = settings
    this.emitEvent('SETTINGS_CHANGED')
  }

  setState(state: BehaviorState): void {
    if (state === this.state) return
    const wasHidden = this.state === 'HIDDEN'
    this.state = state
    if (state === 'HIDDEN') this.stop()
    else if (wasHidden) this.start()
  }

  // 탭·채팅 등 사용자 조작. 이후 5분 동안 선제 발화를 막고 짧은 행동 타이머를 뒤로 민다.
  noteUserInteraction(): void {
    const now = this.now()
    this.lastInteractionAt = now
    this.nextSmallAt = Math.max(this.nextSmallAt, now + BEHAVIOR_TIMING.smallActionMs.min)
  }

  start(): void {
    if (this.timer || this.state === 'HIDDEN') return
    const now = this.now()
    this.lastTick = now
    this.schedule(now)
    this.timer = setInterval(() => this.tick(this.now()), BEHAVIOR_TIMING.tickMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  tick(now: number): void {
    const settings = this.settings
    const gap = now - this.lastTick
    this.lastTick = now
    if (!settings) return

    const timeOfDay = this.currentTimeOfDay
    if (timeOfDay !== this.timeOfDay) {
      this.timeOfDay = timeOfDay
      this.emitEvent('TIME_TICK', { timeOfDay })
    }

    if (gap > BEHAVIOR_TIMING.resumeGapMs) {
      this.schedule(now)
      return
    }
    if (!settings.enabled || settings.doNotDisturb || this.state !== 'IDLE') return

    const quiet = isWithinQuietHours(new Date(now), settings.quietHours)
    if (now >= this.nextSmallAt) {
      this.nextSmallAt = now + randomIn(BEHAVIOR_TIMING.smallActionMs, this.random)
      this.emitIdle('small', SMALL_POOL, timeOfDay)
    }
    if (now >= this.nextBigAt) {
      this.nextBigAt = now + randomIn(BEHAVIOR_TIMING.bigActionMs, this.random)
      this.emitIdle('big', quiet ? REST_POOL : BIG_POOLS[timeOfDay], timeOfDay)
      return
    }
    if (!quiet && this.canSpeak(now, settings)) {
      this.lastProactiveAt = now
      this.proactiveCount += 1
      this.emitEvent('PROACTIVE_DIALOGUE', { timeOfDay } satisfies ProactivePayload)
    }
  }

  private canSpeak(now: number, settings: BehaviorSettings): boolean {
    if (!settings.proactiveDialogue) return false
    if (now - this.lastInteractionAt < BEHAVIOR_TIMING.interactionGraceMs) return false
    const day = new Date(now).toDateString()
    if (day !== this.proactiveDay) {
      this.proactiveDay = day
      this.proactiveCount = 0
    }
    if (this.proactiveCount >= settings.dailyProactiveLimit) return false
    return this.lastProactiveAt === 0 || now - this.lastProactiveAt >= settings.minimumProactiveIntervalMinutes * 60_000
  }

  private schedule(now: number): void {
    this.nextSmallAt = now + randomIn(BEHAVIOR_TIMING.smallActionMs, this.random)
    this.nextBigAt = now + randomIn(BEHAVIOR_TIMING.bigActionMs, this.random)
  }

  private emitIdle(kind: 'small' | 'big', pool: readonly Weighted[], timeOfDay: TimeOfDay): void {
    const pick = pickWeighted(pool, this.random, this.lastMotion)
    this.lastMotion = pick.motion
    const payload: IdleActionPayload = { kind, motion: pick.motion, timeOfDay }
    if (pick.emotion) payload.emotion = pick.emotion
    this.emitEvent('IDLE_ACTION', payload)
  }

  private emitEvent(type: CompanionEvent['type'], payload?: unknown): void {
    this.seq += 1
    this.emit({ id: `${type}-${this.seq}`, type, timestamp: this.now(), payload })
  }
}
