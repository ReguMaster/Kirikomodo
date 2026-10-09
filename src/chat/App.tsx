import { useEffect, useRef, useState, type JSX } from 'react'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import { CHAT_MAX_INPUT_LENGTH, type ChatMessage } from '@shared/types'
import './chat.css'

// 버튼형 퀵 리액션. 일반 입력과 같은 경로로 보내 같은 규칙으로 라우팅된다.
const QUICK_REPLIES = ['안녕!', '뭐 해?', '잠깐 쉬자', '고마워!', '잘 자', '도움말']

const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' })

function mergeById(base: ChatMessage[], extra: ChatMessage[]): ChatMessage[] {
  const seen = new Set(base.map((m) => m.id))
  return [...base, ...extra.filter((m) => !seen.has(m.id))]
}

export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => applyTextScale(settings), [settings])

  // 구독을 먼저 걸고 기록을 받아 그 사이 도착한 메시지가 빠지지 않게 id로 합친다.
  useEffect(() => {
    const off = window.kirikomodo.onChatMessage((message) => setMessages((prev) => mergeById(prev, [message])))
    void window.kirikomodo.getChatHistory().then((history) => setMessages((prev) => mergeById(history, prev)))
    return off
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  const send = (raw: string): void => {
    const text = raw.trim()
    if (!text) return
    setDraft('')
    setError(null)
    window.kirikomodo.sendChat(text).catch(() => setError('메시지를 보내지 못했어요. 다시 시도해 주세요.'))
    inputRef.current?.focus()
  }

  return (
    <div className="chat-root">
      <header className="chat-header">
        <h1>키리코</h1>
        <small>규칙 기반 대화</small>
        <button
          type="button"
          className="chat-clear"
          disabled={messages.length === 0}
          onClick={() => void window.kirikomodo.clearChat().then(() => setMessages([]))}
        >
          기록 지우기
        </button>
      </header>
      <main className="chat-log" ref={logRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">아직 대화가 없어요. 인사부터 건네 볼까요?</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-message chat-message--${m.role}`}>
              <p className="chat-text">{m.text}</p>
              <time className="chat-time" dateTime={new Date(m.createdAt).toISOString()}>
                {timeFormat.format(m.createdAt)}
              </time>
            </div>
          ))
        )}
      </main>
      <div className="chat-quick">
        {QUICK_REPLIES.map((q) => (
          <button key={q} type="button" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      {error && <p className="chat-error">{error}</p>}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          maxLength={CHAT_MAX_INPUT_LENGTH}
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
