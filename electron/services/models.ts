import { access, copyFile, mkdir, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, dialog, net, protocol, shell, type BrowserWindow } from 'electron'
import {
  CORE_FILE,
  MODEL3_SUFFIX,
  MODEL_FILE_MAX_BYTES,
  MODEL_MAP_FILE,
  MODEL_PROTOCOL,
  MODEL_TOTAL_MAX_BYTES,
  inspectModel3,
  type ModelInfo,
  type ModelLibrary
} from '@shared/live2d'
import { log } from './logger'
import { getSettings, updateSettings } from './settings'

const MODEL3_MAX_BYTES = 4 * 1024 * 1024
const MIME: Record<string, string> = { '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.js': 'text/javascript' }

const modelsDir = (): string => join(app.getPath('userData'), 'models')
const coreDir = (): string => join(app.getPath('userData'), 'live2d')
const bundledCoreDir = (): string => join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'external', 'live2dcubismcore')
const registryPath = (): string => join(modelsDir(), 'models.json')

// app.whenReady 이전에 호출해야 한다. 렌더러가 script/img/fetch 로 모델·Core 파일을 읽는 전용 스킴.
export function registerModelScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MODEL_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])
}

// 사용자가 userData/live2d 에 둔 Core 가 있으면 우선(교체용), 없으면 앱에 포함된 external/live2dcubismcore 를 쓴다.
async function findCore(): Promise<string | null> {
  for (const dir of [coreDir(), bundledCoreDir()]) {
    const file = join(dir, CORE_FILE)
    if (await access(file).then(() => true, () => false)) return file
  }
  return null
}

export function registerModelProtocol(): void {
  protocol.handle(MODEL_PROTOCOL, async (request) => {
    const notFound = new Response('not found', { status: 404 })
    const url = new URL(request.url)
    const segments = decodeURIComponent(url.pathname).split('/').filter(Boolean)
    if (segments.length === 0 || segments.some((s) => s === '..' || s === '.')) return notFound
    let file: string | null = null
    if (url.hostname === 'core') {
      if (segments.length === 1 && segments[0] === CORE_FILE) file = await findCore()
    } else if (url.hostname === 'models') {
      file = join(modelsDir(), ...segments)
      if (!file.startsWith(modelsDir() + sep)) file = null
    }
    if (!file) return notFound
    const res = await net.fetch(pathToFileURL(file).href).catch(() => null)
    if (!res?.ok) return notFound
    return new Response(res.body, { status: 200, headers: { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'access-control-allow-origin': '*' } })
  })
}

async function readRegistry(): Promise<ModelInfo[]> {
  try {
    const parsed = JSON.parse(await readFile(registryPath(), 'utf8')) as { models?: ModelInfo[] }
    return Array.isArray(parsed.models) ? parsed.models : []
  } catch {
    return []
  }
}

async function writeRegistry(models: ModelInfo[]): Promise<void> {
  await mkdir(modelsDir(), { recursive: true })
  await writeFile(registryPath(), JSON.stringify({ models }, null, 2), 'utf8')
}

export async function listModels(): Promise<ModelLibrary> {
  return { coreAvailable: (await findCore()) !== null, coreDir: coreDir(), models: await readRegistry() }
}

export function openModelsFolder(): void {
  void mkdir(coreDir(), { recursive: true }).then(() => shell.openPath(coreDir()))
}

function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'model'
}

// 참조 파일이 모두 모델 폴더 안의 실제 파일인지, 크기 한도 안인지, moc3 매직이 맞는지 확인한다.
async function verifyFiles(root: string, files: string[], moc: string): Promise<void> {
  const realRoot = await realpath(root)
  let total = 0
  for (const rel of files) {
    const abs = join(root, rel)
    const real = await realpath(abs).catch(() => null)
    if (!real || !real.startsWith(realRoot + sep)) throw new Error(`참조 파일이 없거나 모델 폴더 밖이에요: ${rel}`)
    const info = await stat(real)
    if (!info.isFile()) throw new Error(`파일이 아니에요: ${rel}`)
    if (info.size > MODEL_FILE_MAX_BYTES) throw new Error(`파일이 너무 커요(64MB 초과): ${rel}`)
    total += info.size
  }
  if (total > MODEL_TOTAL_MAX_BYTES) throw new Error('모델 전체 크기가 256MB 를 넘어요')
  const fh = await open(join(root, moc), 'r')
  try {
    const { buffer } = await fh.read(Buffer.alloc(4), 0, 4, 0)
    if (buffer.toString('latin1') !== 'MOC3') throw new Error('moc3 파일 서명이 맞지 않아요')
  } finally {
    await fh.close()
  }
}

export async function importModelFrom(model3Path: string): Promise<ModelInfo> {
  if (!model3Path.toLowerCase().endsWith(MODEL3_SUFFIX)) throw new Error(`${MODEL3_SUFFIX} 파일을 골라 주세요`)
  const root = dirname(model3Path)
  if ((await stat(model3Path)).size > MODEL3_MAX_BYTES) throw new Error('model3.json 이 너무 커요')
  const summary = inspectModel3(JSON.parse(await readFile(model3Path, 'utf8')))
  await verifyFiles(root, summary.files, summary.moc)

  const models = await readRegistry()
  const baseName = basename(model3Path).slice(0, -MODEL3_SUFFIX.length)
  let id = slug(baseName)
  for (let n = 2; models.some((m) => m.id === id); n++) id = `${slug(baseName)}-${n}`
  const dest = join(modelsDir(), id)
  const model3 = basename(model3Path)
  try {
    await mkdir(dest, { recursive: true })
    for (const rel of [model3, ...summary.files]) {
      await mkdir(dirname(join(dest, rel)), { recursive: true })
      await copyFile(join(root, rel), join(dest, rel))
    }
    await copyFile(join(root, MODEL_MAP_FILE), join(dest, MODEL_MAP_FILE)).catch(() => undefined)
  } catch (err) {
    await rm(dest, { recursive: true, force: true })
    throw err
  }
  const info: ModelInfo = {
    id,
    name: baseName,
    sourceNote: model3Path,
    model3,
    motions: Object.keys(summary.motions),
    expressions: Object.keys(summary.expressions),
    hitAreas: summary.hitAreas.map((h) => h.name),
    importedAt: new Date().toISOString()
  }
  await writeRegistry([...models, info])
  log.info('models', `imported ${id}`, { files: summary.files.length, source: model3Path })
  return info
}

export async function importModel(win: BrowserWindow | null): Promise<ModelInfo | null> {
  const options = { title: 'Live2D 모델 가져오기', filters: [{ name: 'Live2D 모델 (*.model3.json)', extensions: ['json'] }], properties: ['openFile' as const] }
  const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (canceled || !filePaths[0]) return null
  return importModelFrom(filePaths[0])
}

// 앱 복사본만 지운다. 원본은 건드리지 않는다. 쓰던 모델이면 플레이스홀더로 되돌린다.
export async function removeModel(id: string): Promise<ModelLibrary> {
  const models = await readRegistry()
  if (models.some((m) => m.id === id)) {
    await rm(join(modelsDir(), id), { recursive: true, force: true })
    await writeRegistry(models.filter((m) => m.id !== id))
    log.info('models', `removed ${id}`)
  }
  if (getSettings().character.activeModelId === id) await updateSettings({ character: { activeModelId: 'placeholder' } })
  return listModels()
}
