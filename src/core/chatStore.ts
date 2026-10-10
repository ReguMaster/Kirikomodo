import { DatabaseSync } from 'node:sqlite'
import type { ChatMessage, CompanionEventType } from '@shared/types'

// FR-007 로컬 기록. Electron 내장 Node의 node:sqlite를 써서 네이티브 모듈 재빌드 없이 메인 프로세스에서만 접근한다.
// 마이그레이션은 버전 배열 순서대로 한 번씩만 적용한다.
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER);
   CREATE TABLE chat_messages (
     id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL,
     intent TEXT, emotion TEXT, motion TEXT, created_at INTEGER NOT NULL
   );
   CREATE INDEX chat_messages_created ON chat_messages(created_at);
   CREATE TABLE companion_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload_json TEXT, created_at INTEGER NOT NULL);
   CREATE INDEX companion_events_type_created ON companion_events(type, created_at);`
]

export interface ChatStore {
  readonly sessionId: string
  insertMessage(message: ChatMessage): void
  listMessages(limit: number): ChatMessage[]
  clearMessages(): void
  recordEvent(type: CompanionEventType, payload?: unknown): void
  countEventsSince(type: CompanionEventType, since: number): number
  endSession(): void
  close(): void
}

interface MessageRow {
  id: string
  role: ChatMessage['role']
  text: string
  source: ChatMessage['source']
  intent: string | null
  emotion: ChatMessage['emotion'] | null
  motion: ChatMessage['motion'] | null
  created_at: number
}

function toMessage(row: MessageRow): ChatMessage {
  const message: ChatMessage = { id: row.id, role: row.role, text: row.text, source: row.source, createdAt: row.created_at }
  if (row.intent) message.intent = row.intent
  if (row.emotion) message.emotion = row.emotion
  if (row.motion) message.motion = row.motion
  return message
}

function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const applied = (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0
  for (let version = applied + 1; version <= MIGRATIONS.length; version++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[version - 1])
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, Date.now())
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}

export function openChatStore(path: string, sessionId: string, now: () => number = Date.now): ChatStore {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000')
  migrate(db)
  db.prepare('INSERT INTO chat_sessions (id, started_at) VALUES (?, ?)').run(sessionId, now())

  const insert = db.prepare(
    'INSERT INTO chat_messages (id, session_id, role, text, source, intent, emotion, motion, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const list = db.prepare('SELECT * FROM (SELECT rowid AS seq, * FROM chat_messages ORDER BY seq DESC LIMIT ?) ORDER BY seq')
  const insertEvent = db.prepare('INSERT INTO companion_events (type, payload_json, created_at) VALUES (?, ?, ?)')
  const countEvents = db.prepare('SELECT COUNT(*) AS n FROM companion_events WHERE type = ? AND created_at >= ?')

  return {
    sessionId,
    insertMessage: (m) => {
      insert.run(m.id, sessionId, m.role, m.text, m.source, m.intent ?? null, m.emotion ?? null, m.motion ?? null, m.createdAt)
    },
    listMessages: (limit) => (list.all(limit) as unknown as MessageRow[]).map(toMessage),
    clearMessages: () => db.exec('DELETE FROM chat_messages'),
    recordEvent: (type, payload) => {
      insertEvent.run(type, payload === undefined ? null : JSON.stringify(payload), now())
    },
    countEventsSince: (type, since) => (countEvents.get(type, since) as { n: number }).n,
    endSession: () => {
      db.prepare('UPDATE chat_sessions SET ended_at = ? WHERE id = ?').run(now(), sessionId)
    },
    close: () => db.close()
  }
}
