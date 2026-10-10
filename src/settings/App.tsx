import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { AppInfo } from '@shared/ipc'
import type { ModelLibrary } from '@shared/live2d'
import type { SettingsPatch } from '@shared/settings'
import { applyTextScale, useSettingsStore } from '@/app/settingsStore'
import './settings.css'

const TIME_OF_DAY_LABELS = { morning: '아침', day: '낮', evening: '저녁', night: '밤' } as const

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <Row label={label} hint={hint}>
      <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Row>
  )
}

export function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [library, setLibrary] = useState<ModelLibrary | null>(null)

  useEffect(() => applyTextScale(settings), [settings])
  useEffect(() => {
    void window.kirikomodo.getAppInfo().then(setInfo)
    void window.kirikomodo.listModels().then(setLibrary)
  }, [])

  const failNotice = (err: unknown): void => setNotice((err instanceof Error ? err.message : String(err)).replace(/^.*?Error: /, ''))
  const importModel = (): void => {
    void window.kirikomodo
      .importModel()
      .then(async (model) => {
        if (!model) return
        setLibrary(await window.kirikomodo.listModels())
        patch({ character: { activeModelId: model.id } })
        setNotice(`가져왔어요: ${model.name} (모션 ${model.motions.length}종, 표정 ${model.expressions.length}종)`)
      })
      .catch(failNotice)
  }
  const removeModel = (id: string): void => {
    if (!confirm('앱에 복사된 모델만 지워요. 원본 파일은 그대로예요. 지울까요?')) return
    void window.kirikomodo.removeModel(id).then(setLibrary).catch(failNotice)
  }

  const patch = (p: SettingsPatch): void => {
    void update(p).catch(() => setNotice('설정을 저장하지 못했어요. 로그를 확인해 주세요.'))
  }
  const { general, window: win, character, behavior, display, dialogue } = settings

  return (
    <div className="settings-root">
      <header className="settings-header">
        <h1>Kirikomodo 설정</h1>
      </header>
      <main className="settings-body">
        <section className="settings-section">
          <h2>일반</h2>
          <Toggle label="Windows 시작 시 자동 실행" checked={general.autoStart} onChange={(v) => patch({ general: { autoStart: v } })} />
          <Toggle label="항상 위에 표시" checked={win.alwaysOnTop} onChange={(v) => patch({ window: { alwaysOnTop: v } })} />
          <Row label="언어" hint="현재는 한국어만 지원해요">
            <span className="settings-static">한국어</span>
          </Row>
        </section>

        <section className="settings-section">
          <h2>캐릭터</h2>
          <Row
            label="모델"
            hint={
              library === null
                ? undefined
                : library.coreAvailable
                  ? 'Cubism Core 준비됨. .model3.json 을 가져오면 바로 바꿀 수 있어요'
                  : `Cubism Core 없음: ${library.coreDir} 에 live2dcubismcore.min.js 를 넣어 주세요(없으면 기본 캐릭터로 표시)`
            }
          >
            <span className="settings-inline">
              <select value={character.activeModelId} onChange={(e) => patch({ character: { activeModelId: e.target.value } })}>
                <option value="placeholder">기본 플레이스홀더</option>
                {library?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                {character.activeModelId !== 'placeholder' && !library?.models.some((m) => m.id === character.activeModelId) && (
                  <option value={character.activeModelId}>{character.activeModelId} (없음)</option>
                )}
              </select>
              <button type="button" onClick={importModel}>
                가져오기
              </button>
              <button type="button" disabled={character.activeModelId === 'placeholder'} onClick={() => removeModel(character.activeModelId)}>
                삭제
              </button>
              <button type="button" onClick={() => window.kirikomodo.reloadModel()}>
                다시 불러오기
              </button>
              <button type="button" onClick={() => window.kirikomodo.openModelsFolder()}>
                Core 폴더
              </button>
            </span>
          </Row>
          <Row label={`크기 ${Math.round(win.scale * 100)}%`}>
            <input
              type="range"
              min={50}
              max={200}
              step={10}
              value={Math.round(win.scale * 100)}
              onChange={(e) => patch({ window: { scale: Number(e.target.value) / 100 } })}
            />
          </Row>
          <Row label={`불투명도 ${Math.round(win.opacity * 100)}%`}>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={Math.round(win.opacity * 100)}
              onChange={(e) => patch({ window: { opacity: Number(e.target.value) / 100 } })}
            />
          </Row>
          <Toggle label="좌우 반전" checked={character.mirror} onChange={(v) => patch({ character: { mirror: v } })} />
          <Row label="위치 초기화" hint="주 모니터 오른쪽 아래로 되돌려요">
            <button type="button" onClick={() => patch({ window: { x: null, y: null } })}>
              초기화
            </button>
          </Row>
        </section>

        <section className="settings-section">
          <h2>행동</h2>
          <Toggle label="자율 행동" checked={behavior.enabled} onChange={(v) => patch({ behavior: { enabled: v } })} />
          <Toggle label="방해 금지" hint="켜면 자율 행동과 먼저 말 걸기를 모두 멈춰요" checked={behavior.doNotDisturb} onChange={(v) => patch({ behavior: { doNotDisturb: v } })} />
          <Toggle label="먼저 말 걸기" checked={behavior.proactiveDialogue} onChange={(v) => patch({ behavior: { proactiveDialogue: v } })} />
          <Row label="하루 최대 횟수">
            <input
              type="number"
              min={0}
              max={50}
              value={behavior.dailyProactiveLimit}
              onChange={(e) => patch({ behavior: { dailyProactiveLimit: e.target.valueAsNumber } })}
            />
          </Row>
          <Row label="최소 간격 (분)">
            <input
              type="number"
              min={1}
              max={720}
              value={behavior.minimumProactiveIntervalMinutes}
              onChange={(e) => patch({ behavior: { minimumProactiveIntervalMinutes: e.target.valueAsNumber } })}
            />
          </Row>
          <Toggle label="조용한 시간" hint="이 시간에는 쉬는 동작만 하고 말을 걸지 않아요" checked={behavior.quietHours.enabled} onChange={(v) => patch({ behavior: { quietHours: { enabled: v } } })} />
          <Row label="조용한 시간 범위">
            <span className="settings-inline">
              <input type="time" value={behavior.quietHours.start} onChange={(e) => e.target.value && patch({ behavior: { quietHours: { start: e.target.value } } })} />
              ~
              <input type="time" value={behavior.quietHours.end} onChange={(e) => e.target.value && patch({ behavior: { quietHours: { end: e.target.value } } })} />
            </span>
          </Row>
          <Row label="시간대 시작 시각" hint="아침·낮·저녁·밤이 시작하는 시">
            <span className="settings-inline">
              {(Object.keys(TIME_OF_DAY_LABELS) as (keyof typeof TIME_OF_DAY_LABELS)[]).map((key) => (
                <label key={key} className="settings-mini">
                  {TIME_OF_DAY_LABELS[key]}
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={behavior.timeOfDay[key]}
                    onChange={(e) => patch({ behavior: { timeOfDay: { [key]: e.target.valueAsNumber } } })}
                  />
                </label>
              ))}
            </span>
          </Row>
        </section>

        <section className="settings-section">
          <h2>대화</h2>
          <p className="settings-note">현재는 규칙 기반 대화만 지원해요. LLM이나 외부 API는 사용하지 않아요.</p>
          <Toggle label="스크립트 대화" checked={dialogue.scriptedEnabled} onChange={(v) => patch({ dialogue: { scriptedEnabled: v } })} />
          <Row label={`말풍선 표시 시간 ${display.speechBubbleSeconds}초`}>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={display.speechBubbleSeconds}
              onChange={(e) => patch({ display: { speechBubbleSeconds: Number(e.target.value) } })}
            />
          </Row>
          <Row label="대화 기록">
            <span className="settings-inline">
              <button
                type="button"
                onClick={() =>
                  void window.kirikomodo.exportChat().then((path) => setNotice(path ? `내보냈어요: ${path}` : null))
                }
              >
                JSON 내보내기
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('대화 기록을 모두 지울까요? 되돌릴 수 없어요.')) void window.kirikomodo.clearChat().then(() => setNotice('대화 기록을 지웠어요.'))
                }}
              >
                전체 삭제
              </button>
            </span>
          </Row>
        </section>

        <section className="settings-section">
          <h2>표시 · 접근성</h2>
          <Row label="FPS 제한">
            <select value={display.fpsLimit} onChange={(e) => patch({ display: { fpsLimit: Number(e.target.value) as 30 | 60 } })}>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </Row>
          <Toggle label="애니메이션 줄이기" checked={display.reduceMotion} onChange={(v) => patch({ display: { reduceMotion: v } })} />
          <Row label={`텍스트 크기 ${Math.round(display.textScale * 100)}%`}>
            <input
              type="range"
              min={80}
              max={150}
              step={10}
              value={Math.round(display.textScale * 100)}
              onChange={(e) => patch({ display: { textScale: Number(e.target.value) / 100 } })}
            />
          </Row>
        </section>

        <section className="settings-section">
          <h2>고급</h2>
          <Row label="데이터 위치" hint={info?.userDataPath ?? ''}>
            <button type="button" onClick={() => window.kirikomodo.openLogsFolder()}>
              로그 폴더 열기
            </button>
          </Row>
          <Row label="설정 초기화" hint="창 위치를 포함한 모든 설정을 기본값으로 되돌려요">
            <button
              type="button"
              onClick={() => {
                if (confirm('모든 설정을 기본값으로 되돌릴까요?')) void window.kirikomodo.resetSettings().then(() => setNotice('설정을 초기화했어요.'))
              }}
            >
              초기화
            </button>
          </Row>
        </section>
      </main>
      <footer className="settings-footer">
        <span>{notice ?? (info ? `${info.name} ${info.version}` : '')}</span>
        <button type="button" onClick={() => window.kirikomodo.closeSelf()}>
          닫기
        </button>
      </footer>
    </div>
  )
}
