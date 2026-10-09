import { useEffect, useState, type JSX } from 'react'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import './chat.css'

export const MAX_INPUT_LENGTH = 1000

// 대화 로직(ScriptedDialogueProvider)은 후속 기능에서 연결한다. 여기서는 창 골격만 둔다.
export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const [draft, setDraft] = useState('')

  useEffect(() => applyTextScale(settings), [settings])

  return (
    <div className="chat-root">
      <header className="chat-header">
        <h1>키리코</h1>
        <small>규칙 기반 대화</small>
      </header>
      <main className="chat-log">
        <p className="chat-empty">아직 대화가 없어요.</p>
      </main>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          setDraft('')
        }}
      >
        <input
          value={draft}
          maxLength={MAX_INPUT_LENGTH}
          placeholder="메시지를 입력하세요"
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <button type="submit" className="primary" disabled={!draft.trim()}>
          보내기
        </button>
      </form>
    </div>
  )
}
