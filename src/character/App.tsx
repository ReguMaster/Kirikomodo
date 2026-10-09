import { useEffect, useRef, type JSX } from 'react'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import { createCharacterRenderer, type ManagedRenderer } from './CharacterRenderer'
import { MotionController } from './MotionController'
import { BehaviorEngine, type IdleActionPayload } from '@/core/BehaviorEngine'
import type { CompanionEvent, Emotion, HitArea, Motion } from '@shared/types'
import './character.css'

interface PreviewDetail {
  emotion?: Emotion
  motion?: Motion
}

const DRAG_THRESHOLD_PX = 4
const SCALE_STEP = 0.1
const SCALE_MIN = 0.5
const SCALE_MAX = 2
const TAP_EMOTION: Record<NonNullable<HitArea>, Emotion> = { head: 'happy', body: 'playful' }

function adjustScale(direction: 1 | -1): void {
  const { settings, update } = useSettingsStore.getState()
  const scale = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, settings.window.scale + direction * SCALE_STEP)) * 10) / 10
  if (scale !== settings.window.scale) void update({ window: { scale } })
}

// 캐릭터 창 루트. 렌더러를 stage에 mount하고 히트 테스트로 투명 영역 클릭 통과, 드래그 이동, 클릭 반응, 시선 추적을 잇는다.
export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const stageRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ManagedRenderer | null>(null)
  const engineRef = useRef<BehaviorEngine | null>(null)

  useEffect(() => applyTextScale(settings), [settings])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const renderer = createCharacterRenderer('placeholder')
    rendererRef.current = renderer
    void renderer.mount(stage)
    const motions = new MotionController(renderer)

    // 행동 엔진은 이벤트만 발행한다. 여기서 IDLE_ACTION을 모션/감정으로 옮기고, 선제 대사는 대화 기능이 붙으면 처리한다.
    const onCompanionEvent = (event: CompanionEvent): void => {
      if (event.type !== 'IDLE_ACTION') return
      const { motion, emotion } = event.payload as IdleActionPayload
      if (emotion) motions.express(emotion)
      void motions.play(motion, 'autonomous')
    }
    const engine = new BehaviorEngine(onCompanionEvent)
    engineRef.current = engine
    engine.configure(useSettingsStore.getState().settings.behavior)
    const onVisibility = (): void => engine.setState(document.hidden ? 'HIDDEN' : 'IDLE')
    onVisibility()
    engine.start()

    let ignoring: boolean | null = null
    const setIgnore = (ignore: boolean): void => {
      if (ignore === ignoring) return
      ignoring = ignore
      window.kirikomodo.setIgnoreMouse(ignore)
    }

    // 드래그는 화면 좌표 누적 델타로 처리한다(창이 따라 움직여 clientX는 흔들린다). 4px 미만이면 클릭으로 본다.
    let press: { x: number; y: number; area: NonNullable<HitArea> } | null = null
    let dragging = false
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      const area = renderer.hitTest(event.clientX, event.clientY)
      if (!area) return
      press = { x: event.screenX, y: event.screenY, area }
      dragging = false
      engine.setState('INTERACTING')
      stage.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent): void => {
      if (!press) {
        setIgnore(renderer.hitTest(event.clientX, event.clientY) === null)
        return
      }
      const dx = event.screenX - press.x
      const dy = event.screenY - press.y
      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        dragging = true
        window.kirikomodo.dragStart()
      }
      if (dragging) window.kirikomodo.drag(dx, dy)
    }
    const onPointerUp = (): void => {
      if (!press) return
      const { area } = press
      press = null
      engine.setState('IDLE')
      if (dragging) {
        dragging = false
        return
      }
      engine.noteUserInteraction()
      motions.express(TAP_EMOTION[area])
      void motions.play('reactTap', 'manual')
    }
    const onContextMenu = (event: MouseEvent): void => {
      event.preventDefault()
      window.kirikomodo.showContextMenu()
    }
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      adjustScale(event.deltaY < 0 ? 1 : -1)
    }
    const offCursor = window.kirikomodo.onCursorMoved(({ x, y }) => {
      const mirrored = useSettingsStore.getState().settings.character.mirror
      renderer.setLookTarget(mirrored ? -x : x, y)
    })
    // 설정 미리보기·테스트용 진입점. 엔진이 붙기 전까지 감정/모션을 직접 지정한다.
    const onPreview = (event: Event): void => {
      const { emotion, motion } = (event as CustomEvent<PreviewDetail>).detail ?? {}
      if (emotion) motions.express(emotion)
      if (motion) void motions.play(motion, 'manual')
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('kirikomodo:preview', onPreview)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      engine.stop()
      engineRef.current = null
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('kirikomodo:preview', onPreview)
      offCursor()
      motions.dispose()
      rendererRef.current = null
      void renderer.dispose()
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setOptions({ fpsLimit: settings.display.fpsLimit, reduceMotion: settings.display.reduceMotion })
  }, [settings.display.fpsLimit, settings.display.reduceMotion])

  useEffect(() => {
    engineRef.current?.configure(settings.behavior)
  }, [settings.behavior])

  return (
    <div className="character-root">
      <div
        id="character-stage"
        ref={stageRef}
        className="character-stage"
        style={{ transform: settings.character.mirror ? 'scaleX(-1)' : undefined }}
        onDoubleClick={() => window.kirikomodo.openWindow('chat')}
      />
    </div>
  )
}
