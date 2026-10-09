import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_SETTINGS, SettingsSchema, applySettingsPatch, type Settings, type SettingsPatch } from '@shared/settings'
import { log } from './logger'

type Listener = (settings: Settings) => void

let current: Settings = DEFAULT_SETTINGS
const listeners = new Set<Listener>()
let saveChain: Promise<void> = Promise.resolve()

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

async function readAndParse(path: string): Promise<Settings | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = SettingsSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
    log.warn('settings', `invalid settings at ${path}`, parsed.error.issues.slice(0, 3))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('settings', `failed to read ${path}`, err)
  }
  return null
}

// 손상 시 백업 → 기본값 순으로 복구한다. 실패해도 앱은 기본값으로 계속 뜬다.
export async function loadSettings(): Promise<Settings> {
  const path = settingsPath()
  current = (await readAndParse(path)) ?? (await readAndParse(`${path}.bak`)) ?? DEFAULT_SETTINGS
  return current
}

export function getSettings(): Settings {
  return current
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  current = applySettingsPatch(current, patch)
  for (const listener of listeners) listener(current)
  scheduleSave()
  return current
}

export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// 임시 파일 쓰기 → 기존 파일 백업 → rename 교체. 저장 실패 시 기존 파일을 유지한다.
function scheduleSave(): void {
  const snapshot = current
  saveChain = saveChain
    .then(async () => {
      const path = settingsPath()
      await mkdir(dirname(path), { recursive: true })
      const tmp = `${path}.tmp`
      await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
      await copyFile(path, `${path}.bak`).catch(() => undefined)
      await rename(tmp, path)
    })
    .catch((err) => log.error('settings', 'save failed; keeping previous file', err))
}

export function flushSettings(): Promise<void> {
  return saveChain
}
