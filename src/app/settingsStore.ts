import { create } from 'zustand'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@shared/settings'

interface SettingsState {
  settings: Settings
  loaded: boolean
  load(): Promise<void>
  update(patch: SettingsPatch): Promise<void>
}

// 모든 창이 공유하는 설정 스토어. 메인 프로세스가 단일 소스이고, 변경 이벤트로 동기화한다.
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await window.kirikomodo.getSettings()
    set({ settings, loaded: true })
  },
  update: async (patch) => {
    const settings = await window.kirikomodo.updateSettings(patch)
    set({ settings })
  }
}))

let subscribed = false
export function bootstrapSettings(): void {
  if (subscribed) return
  subscribed = true
  void useSettingsStore.getState().load()
  window.kirikomodo.onSettingsChanged((settings) => useSettingsStore.setState({ settings, loaded: true }))
}

export function applyTextScale(settings: Settings): void {
  document.documentElement.style.setProperty('--text-scale', String(settings.display.textScale))
}
