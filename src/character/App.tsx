import { useEffect, type JSX } from 'react'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import './character.css'

// 실제 캐릭터 렌더러(플레이스홀더/Live2D)는 CharacterRenderer 구현체가 이 stage에 mount된다.
// stage 밖(투명 영역)에서는 마우스를 통과시킨다. 렌더러가 stage 크기를 캐릭터에 맞추면 히트 영역이 된다.
export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)

  useEffect(() => applyTextScale(settings), [settings])

  return (
    <div className="character-root">
      <div
        id="character-stage"
        className="character-stage"
        style={{ transform: settings.character.mirror ? 'scaleX(-1)' : undefined }}
        onPointerEnter={() => window.kirikomodo.setIgnoreMouse(false)}
        onPointerLeave={() => window.kirikomodo.setIgnoreMouse(true)}
        onDoubleClick={() => window.kirikomodo.openWindow('chat')}
      />
    </div>
  )
}
