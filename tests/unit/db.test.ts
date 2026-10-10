import { describe, expect, it } from 'vitest'
import { openChatStore } from '@/core/chatStore'
import type { ChatMessage } from '@shared/types'

const msg = (id: string, createdAt: number, role: ChatMessage['role'] = 'user'): ChatMessage => ({
  id,
  role,
  text: `t${id}`,
  source: role === 'user' ? 'user' : 'script',
  createdAt,
  ...(role === 'character' ? { emotion: 'happy' as const, motion: 'wave' as const, intent: 'greeting' } : {})
})

describe('ChatStore (node:sqlite)', () => {
  it('메시지를 저장하고 시간순으로 최근 N건만 돌려준다', () => {
    const store = openChatStore(':memory:', 's1')
    store.insertMessage(msg('a', 1))
    store.insertMessage(msg('b', 2, 'character'))
    store.insertMessage(msg('c', 3))
    expect(store.listMessages(2).map((m) => m.id)).toEqual(['b', 'c'])
    const b = store.listMessages(10)[1]
    expect(b).toMatchObject({ emotion: 'happy', motion: 'wave', intent: 'greeting', source: 'script' })
    expect('motion' in store.listMessages(10)[0]).toBe(false)
    store.clearMessages()
    expect(store.listMessages(10)).toEqual([])
    store.close()
  })

  it('이벤트 수를 기준 시각 이후로 센다', () => {
    let t = 100
    const store = openChatStore(':memory:', 's2', () => t)
    store.recordEvent('PROACTIVE_DIALOGUE', { timeOfDay: 'day' })
    t = 200
    store.recordEvent('PROACTIVE_DIALOGUE')
    store.recordEvent('USER_CHAT')
    expect(store.countEventsSince('PROACTIVE_DIALOGUE', 0)).toBe(2)
    expect(store.countEventsSince('PROACTIVE_DIALOGUE', 150)).toBe(1)
    expect(store.countEventsSince('USER_TAP', 0)).toBe(0)
    store.endSession()
    store.close()
  })

  it('같은 DB를 다시 열어도 마이그레이션을 중복 적용하지 않는다', () => {
    const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const { tmpdir } = require('node:os') as typeof import('node:os')
    const path = join(mkdtempSync(join(tmpdir(), 'kmd-db-')), 'test.sqlite')
    const first = openChatStore(path, 's1')
    first.insertMessage(msg('a', 1))
    first.close()
    const second = openChatStore(path, 's2')
    expect(second.listMessages(10).map((m) => m.id)).toEqual(['a'])
    second.close()
  })
})
