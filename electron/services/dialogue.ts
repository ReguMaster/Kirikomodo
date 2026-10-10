import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, app, dialog } from 'electron'
import { IPC } from '@shared/ipc'
import type { ChatMessage, TimeOfDay } from '@shared/types'
import { getTimeOfDay, isWithinQuietHours } from '@core/BehaviorEngine'
import { ScriptedDialogueProvider } from '@core/ScriptedDialogueProvider'
import { openChatStore, type ChatStore } from '@core/chatStore'
import { getSettings } from './settings'
import { log } from './logger'

// 대화 허브. 채팅창 입력과 캐릭터 창의 선제 발화 요청을 받아 응답을 만들고 모든 창에 푸시한다.
// 기록은 SQLite(메인 전용). DB를 못 열면 메모리 기록으로 내려가 앱은 계속 뜬다.
const HISTORY_LIMIT = 500
const provider = new ScriptedDialogueProvider()
let store: ChatStore | null = null
let memory: ChatMessage[] = []

export function initDialogueStore(): void {
  const sessionId = randomUUID()
  const path = join(app.getPath('userData'), 'kirikomodo.sqlite')
  try {
    store = openChatStore(path, sessionId)
    log.info('chat', 'store opened', { path, sessionId })
  } catch (err) {
    log.error('chat', 'store open failed; using in-memory history', err)
  }
}

export function closeDialogueStore(): void {
  try {
    store?.endSession()
    store?.close()
  } catch (err) {
    log.warn('chat', 'store close failed', err)
  }
  store = null
}

function currentTimeOfDay(): TimeOfDay {
  return getTimeOfDay(new Date(), getSettings().behavior.timeOfDay)
}

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function push(message: ChatMessage): ChatMessage {
  if (store) {
    try {
      store.insertMessage(message)
    } catch (err) {
      log.error('chat', 'insert failed', err)
    }
  } else {
    memory.push(message)
    if (memory.length > HISTORY_LIMIT) memory = memory.slice(-HISTORY_LIMIT)
  }
  broadcast(IPC.chatMessage, message)
  return message
}

export function getChatHistory(): ChatMessage[] {
  if (!store) return memory
  try {
    return store.listMessages(HISTORY_LIMIT)
  } catch (err) {
    log.error('chat', 'history read failed', err)
    return []
  }
}

export function clearChat(): void {
  memory = []
  store?.clearMessages()
  broadcast(IPC.chatCleared)
  log.info('chat', 'history cleared')
}

export async function exportChat(owner: BrowserWindow | null): Promise<string | null> {
  const defaultName = `kirikomodo-chat-${new Date().toISOString().slice(0, 10)}.json`
  const options = { defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] }
  const { canceled, filePath } = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return null
  await writeFile(filePath, JSON.stringify({ exportedAt: new Date().toISOString(), messages: getChatHistory() }, null, 2), 'utf8')
  log.info('chat', 'history exported', { filePath })
  return filePath
}

export async function sendChat(text: string): Promise<ChatMessage> {
  if (!getSettings().dialogue.scriptedEnabled) throw new Error('scripted dialogue disabled')
  const now = Date.now()
  push({ id: randomUUID(), role: 'user', text, source: 'user', createdAt: now })
  store?.recordEvent('USER_CHAT')
  const reply = await provider.respond({ text, now: new Date(now).toISOString(), context: { timeOfDay: currentTimeOfDay() } })
  return push({ id: randomUUID(), role: 'character', createdAt: Date.now(), ...reply })
}

// 하루 횟수는 DB 이벤트로 세어 재시작 후에도 유지한다. 렌더러 엔진의 메모리 카운터는 1차 게이트.
export function speakProactive(): ChatMessage | null {
  const { behavior, dialogue } = getSettings()
  if (!dialogue.scriptedEnabled || !behavior.proactiveDialogue) return null
  if (behavior.doNotDisturb || isWithinQuietHours(new Date(), behavior.quietHours)) return null
  const timeOfDay = currentTimeOfDay()
  if (store) {
    const dayStart = new Date().setHours(0, 0, 0, 0)
    if (store.countEventsSince('PROACTIVE_DIALOGUE', dayStart) >= behavior.dailyProactiveLimit) return null
    store.recordEvent('PROACTIVE_DIALOGUE', { timeOfDay })
  }
  const reply = provider.proactive(timeOfDay)
  return push({ id: randomUUID(), role: 'character', createdAt: Date.now(), ...reply })
}
