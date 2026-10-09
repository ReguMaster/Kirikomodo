import { useEffect, type JSX } from 'react'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import './character.css'

// 실제 캐릭터 렌더러(플레이스홀더/Live2D)는 CharacterRenderer 구현체가 이 stage에 mount된다.
export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)

  useEffect(() => applyTextScale(settings), [settings])

  return (
    <div className="character-root">
      <div
        id="character-stage"
        className="character-stage"
        style={{ transform: settings.character.mirror ? 'scaleX(-1)' : undefined }}
        onDoubleClick={() => window.kirikomodo.openWindow('chat')}
      />
    </div>
  )
}
