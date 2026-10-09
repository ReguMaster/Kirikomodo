import { useEffect, useState, type JSX } from 'react'
import type { AppInfo } from '@shared/ipc'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import './settings.css'

// 전체 설정 항목은 후속 기능에서 채운다. 여기서는 IPC 왕복을 검증할 최소 항목만 둔다.
export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => applyTextScale(settings), [settings])
  useEffect(() => {
    void window.kirikomodo.getAppInfo().then(setInfo)
  }, [])

  return (
    <div className="settings-root">
      <header className="settings-header">
        <h1>Kirikomodo 설정</h1>
      </header>
      <main className="settings-body">
        <section className="settings-section">
          <h2>일반</h2>
          <div className="settings-row">
            <label htmlFor="alwaysOnTop">항상 위에 표시</label>
            <input
              id="alwaysOnTop"
              type="checkbox"
              checked={settings.window.alwaysOnTop}
              onChange={(e) => void update({ window: { alwaysOnTop: e.target.checked } })}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="autoStart">Windows 시작 시 자동 실행</label>
            <input
              id="autoStart"
              type="checkbox"
              checked={settings.general.autoStart}
              onChange={(e) => void update({ general: { autoStart: e.target.checked } })}
            />
          </div>
        </section>
        <section className="settings-section">
          <h2>캐릭터</h2>
          <div className="settings-row">
            <label htmlFor="scale">크기 ({Math.round(settings.window.scale * 100)}%)</label>
            <input
              id="scale"
              type="range"
              min={50}
              max={200}
              step={10}
              value={Math.round(settings.window.scale * 100)}
              onChange={(e) => void update({ window: { scale: Number(e.target.value) / 100 } })}
            />
          </div>
          <div className="settings-row">
            <label htmlFor="mirror">좌우 반전</label>
            <input
              id="mirror"
              type="checkbox"
              checked={settings.character.mirror}
              onChange={(e) => void update({ character: { mirror: e.target.checked } })}
            />
          </div>
        </section>
        <section className="settings-section">
          <h2>대화</h2>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>현재는 규칙 기반 대화만 지원해요. LLM이나 외부 API는 사용하지 않아요.</p>
        </section>
      </main>
      <footer className="settings-footer">
        <span>{info ? `${info.name} ${info.version}` : ''}</span>
        <button type="button" onClick={() => window.kirikomodo.closeSelf()}>
          닫기
        </button>
      </footer>
    </div>
  )
}
