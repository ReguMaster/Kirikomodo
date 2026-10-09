import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { ChatMessage, TimeOfDay } from '@shared/types'
import { getTimeOfDay } from '@core/BehaviorEngine'
import { ScriptedDialogueProvider } from '@core/ScriptedDialogueProvider'
import { getSettings } from './settings'
import { log } from './logger'

// 대화 허브. 채팅창 입력과 캐릭터 창의 선제 발화 요청을 받아 응답을 만들고 모든 창에 푸시한다.
// ponytail: 기록은 메모리 보관(최근 500건). SQLite 영속화는 설정·데이터 저장 기능에서 붙인다.
const MAX_HISTORY = 500
const provider = new ScriptedDialogueProvider()
let history: ChatMessage[] = []

function currentTimeOfDay(): TimeOfDay {
  return getTimeOfDay(new Date(), getSettings().behavior.timeOfDay)
}

function push(message: ChatMessage): ChatMessage {
  history.push(message)
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.chatMessage, message)
  }
  return message
}

export function getChatHistory(): ChatMessage[] {
  return history
}

export function clearChat(): void {
  history = []
  log.info('chat', 'history cleared')
}

export async function sendChat(text: string): Promise<ChatMessage> {
  const now = Date.now()
  push({ id: randomUUID(), role: 'user', text, source: 'user', createdAt: now })
  const reply = await provider.respond({ text, now: new Date(now).toISOString(), context: { timeOfDay: currentTimeOfDay() } })
  return push({ id: randomUUID(), role: 'character', createdAt: Date.now(), ...reply })
}

export function speakProactive(): ChatMessage {
  const reply = provider.proactive(currentTimeOfDay())
  return push({ id: randomUUID(), role: 'character', createdAt: Date.now(), ...reply })
}
