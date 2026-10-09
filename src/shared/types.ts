// 명세서 5절 인터페이스 계약. Renderer·Engine은 이 타입으로만 결합한다.

export type Emotion = 'neutral' | 'happy' | 'playful' | 'curious' | 'concerned' | 'sleepy' | 'annoyed'

export type Motion =
  | 'idle'
  | 'blink'
  | 'look'
  | 'greet'
  | 'wave'
  | 'headTilt'
  | 'stretch'
  | 'yawn'
  | 'reactTap'
  | 'rest'

export const EMOTIONS: readonly Emotion[] = ['neutral', 'happy', 'playful', 'curious', 'concerned', 'sleepy', 'annoyed']
export const MOTIONS: readonly Motion[] = ['idle', 'blink', 'look', 'greet', 'wave', 'headTilt', 'stretch', 'yawn', 'reactTap', 'rest']

export type HitArea = 'head' | 'body' | null

export interface CharacterRenderer {
  mount(container: HTMLElement): Promise<void>
  dispose(): Promise<void>
  setEmotion(emotion: Emotion): void
  playMotion(motion: Motion, priority?: number): Promise<boolean>
  setLookTarget(x: number, y: number): void
  setScale(scale: number): void
  hitTest(x: number, y: number): HitArea
}

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'

export interface DialogueRequest {
  text: string
  now: string
  context: { timeOfDay: TimeOfDay }
}

export interface DialogueResponse {
  text: string
  emotion: Emotion
  motion?: Motion
  intent: string
  source: 'script'
}

export interface DialogueProvider {
  respond(request: DialogueRequest): Promise<DialogueResponse>
}

export type CompanionEventType =
  | 'USER_TAP'
  | 'USER_CHAT'
  | 'TIME_TICK'
  | 'IDLE_ACTION'
  | 'PROACTIVE_DIALOGUE'
  | 'SETTINGS_CHANGED'
  | 'MODEL_CHANGED'

export interface CompanionEvent {
  id: string
  type: CompanionEventType
  timestamp: number
  payload?: unknown
}

export type AppState = 'BOOTING' | 'READY' | 'IDLE' | 'INTERACTING' | 'CHATTING' | 'RESTING' | 'HIDDEN' | 'SHUTDOWN'
