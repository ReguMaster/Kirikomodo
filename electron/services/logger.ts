import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

type Level = 'info' | 'warn' | 'error'

let logDir: string | null = null
let queue: Promise<void> = Promise.resolve()

export function logsDir(): string {
  if (!logDir) logDir = join(app.getPath('userData'), 'logs')
  return logDir
}

function logFilePath(): string {
  const day = new Date().toISOString().slice(0, 10)
  return join(logsDir(), `kirikomodo-${day}.log`)
}

function write(level: Level, scope: string, message: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] [${scope}] ${message}${extra !== undefined ? ' ' + safeStringify(extra) : ''}\n`
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(line.trimEnd())
  if (!app.isReady()) return
  queue = queue
    .then(async () => {
      await mkdir(logsDir(), { recursive: true })
      await appendFile(logFilePath(), line, 'utf8')
    })
    .catch(() => undefined)
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const log = {
  info: (scope: string, message: string, extra?: unknown) => write('info', scope, message, extra),
  warn: (scope: string, message: string, extra?: unknown) => write('warn', scope, message, extra),
  error: (scope: string, message: string, extra?: unknown) => write('error', scope, message, extra)
}
