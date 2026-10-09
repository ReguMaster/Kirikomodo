import { useEffect, useRef, type JSX } from 'react'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import { createCharacterRenderer, type ManagedRenderer } from './CharacterRenderer'
import type { Emotion, Motion } from '@shared/types'
import './character.css'

interface PreviewDetail {
  emotion?: Emotion
  motion?: Motion
}

// 캐릭터 창 루트. 렌더러(플레이스홀더/Live2D)를 stage에 mount하고, 히트 테스트 결과로 투명 영역 클릭 통과를 제어한다.
export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const stageRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ManagedRenderer | null>(null)

  useEffect(() => applyTextScale(settings), [settings])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const renderer = createCharacterRenderer('placeholder')
    rendererRef.current = renderer
    void renderer.mount(stage)

    let ignoring: boolean | null = null
    const onPointerMove = (event: PointerEvent): void => {
      const ignore = renderer.hitTest(event.clientX, event.clientY) === null
      if (ignore !== ignoring) {
        ignoring = ignore
        window.kirikomodo.setIgnoreMouse(ignore)
      }
      renderer.setLookTarget((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1)
    }
    const onPointerLeave = (): void => renderer.setLookTarget(0, 0)
    // 설정 미리보기·테스트용 진입점. 엔진이 붙기 전까지 감정/모션을 직접 지정한다.
    const onPreview = (event: Event): void => {
      const { emotion, motion } = (event as CustomEvent<PreviewDetail>).detail ?? {}
      if (emotion) renderer.setEmotion(emotion)
      if (motion) void renderer.playMotion(motion, 10)
    }
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('kirikomodo:preview', onPreview)

    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('kirikomodo:preview', onPreview)
      rendererRef.current = null
      void renderer.dispose()
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setOptions({ fpsLimit: settings.display.fpsLimit, reduceMotion: settings.display.reduceMotion })
  }, [settings.display.fpsLimit, settings.display.reduceMotion])

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
