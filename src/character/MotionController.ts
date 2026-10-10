import { EMOTIONS, MOTIONS, type CharacterRenderer, type Emotion, type Motion } from '@shared/types'

// FR-004 모션 우선순위: 수동/클릭 > 대화 > 자율 > 대기. 렌더러의 playMotion(priority)에 그대로 전달된다(자동 깜빡임은 렌더러 내부 -1).
export const MOTION_PRIORITY = { idle: 0, autonomous: 1, dialogue: 2, manual: 3 } as const
export type MotionSource = keyof typeof MOTION_PRIORITY

export interface EmotionProfile {
  motions: readonly Motion[]
  durationMs: number
  cooldownMs: number
}

// 감정별 후보 모션·기본 지속시간·쿨다운. 지속시간이 지나면 neutral로 돌아간다(0이면 유지).
export const EMOTION_PROFILES: Record<Emotion, EmotionProfile> = {
  neutral: { motions: ['idle', 'look', 'headTilt'], durationMs: 0, cooldownMs: 0 },
  happy: { motions: ['greet', 'wave', 'reactTap'], durationMs: 2500, cooldownMs: 1000 },
  playful: { motions: ['headTilt', 'wave', 'reactTap'], durationMs: 2500, cooldownMs: 1000 },
  curious: { motions: ['look', 'headTilt'], durationMs: 3000, cooldownMs: 2000 },
  concerned: { motions: ['headTilt', 'look'], durationMs: 3000, cooldownMs: 2000 },
  sleepy: { motions: ['yawn', 'stretch', 'rest'], durationMs: 6000, cooldownMs: 5000 },
  annoyed: { motions: ['headTilt', 'look'], durationMs: 2000, cooldownMs: 3000 }
}

// 같은 모션의 재추첨을 막는 최소 간격. 수동 명령은 쿨다운을 무시한다.
export const MOTION_COOLDOWN_MS: Record<Motion, number> = {
  idle: 0,
  blink: 0,
  look: 3000,
  greet: 8000,
  wave: 8000,
  headTilt: 5000,
  stretch: 30000,
  yawn: 30000,
  reactTap: 0,
  rest: 10000
}

export interface ActiveMotion {
  motion: Motion
  source: MotionSource
}

// 파라미터 소유권: 감정 → base, 모션 → 프레임별 오프셋, 시선 → setLookTarget. 세 층은 렌더러가 합성하므로 여기서는 순서와 시점만 관리한다.
export class MotionController {
  private active: ActiveMotion | null = null
  private lastPlayedAt = new Map<Motion, number>()
  private lastMotion: Motion | null = null
  private emotion: Emotion = 'neutral'
  private revertTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly renderer: CharacterRenderer,
    private readonly now: () => number = () => Date.now()
  ) {}

  get current(): ActiveMotion | null {
    return this.active
  }

  get currentEmotion(): Emotion {
    return this.emotion
  }

  get previousMotion(): Motion | null {
    return this.lastMotion
  }

  // 반환값: 끝까지 재생되면 true. 우선순위·쿨다운·중복으로 거절되거나 인터럽트되면 false.
  play(rawMotion: Motion, source: MotionSource): Promise<boolean> {
    const motion = MOTIONS.includes(rawMotion) ? rawMotion : 'idle'
    const priority = MOTION_PRIORITY[source]
    if (this.active) {
      if (this.active.motion === motion) return Promise.resolve(false)
      if (MOTION_PRIORITY[this.active.source] > priority) return Promise.resolve(false)
    }
    if (source !== 'manual' && !this.isReady(motion)) return Promise.resolve(false)

    const entry: ActiveMotion = { motion, source }
    this.active = entry
    this.lastPlayedAt.set(motion, this.now())
    this.lastMotion = motion
    let result: Promise<boolean>
    try {
      result = this.renderer.playMotion(motion, priority)
    } catch {
      result = Promise.resolve(false)
    }
    return result
      .catch(() => false)
      .then((finished) => {
        if (this.active === entry) this.active = null
        return finished
      })
  }

  isReady(motion: Motion): boolean {
    const last = this.lastPlayedAt.get(motion)
    return last === undefined || this.now() - last >= MOTION_COOLDOWN_MS[motion]
  }

  // 감정 설정. durationMs(기본: 프로필 값)가 지나면 neutral로 복귀한다. 0이면 유지.
  express(rawEmotion: Emotion, durationMs?: number): void {
    const emotion = EMOTIONS.includes(rawEmotion) ? rawEmotion : 'neutral'
    this.clearRevert()
    this.emotion = emotion
    this.renderer.setEmotion(emotion)
    const hold = durationMs ?? EMOTION_PROFILES[emotion].durationMs
    if (emotion !== 'neutral' && hold > 0) {
      this.revertTimer = setTimeout(() => {
        this.revertTimer = null
        this.express('neutral')
      }, hold)
    }
  }

  cancel(): void {
    this.active = null
    void this.renderer.playMotion('idle', MOTION_PRIORITY.manual)
  }

  dispose(): void {
    this.clearRevert()
    this.active = null
  }

  private clearRevert(): void {
    if (this.revertTimer) clearTimeout(this.revertTimer)
    this.revertTimer = null
  }
}
