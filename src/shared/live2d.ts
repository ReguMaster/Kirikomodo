// Live2D 모델 가져오기 계약(FR-003). model3.json 참조 검사는 순수 함수라 메인·테스트에서 함께 쓴다.

export interface ModelInfo {
  id: string
  name: string
  sourceNote: string
  /** 모델 폴더 기준 model3.json 상대 경로 */
  model3: string
  motions: string[]
  expressions: string[]
  hitAreas: string[]
  importedAt: string
}

export interface ModelLibrary {
  coreAvailable: boolean
  coreDir: string
  models: ModelInfo[]
}

export interface Model3Summary {
  moc: string
  /** model3.json 순서 그대로(드로어블 textureIndices 기준) */
  textures: string[]
  /** moc·텍스처·모션·표정·물리·포즈 등 복사 대상 전부(상대 경로) */
  files: string[]
  motions: Record<string, string[]>
  expressions: Record<string, string>
  hitAreas: { id: string; name: string }[]
  eyeBlinkIds: string[]
  lipSyncIds: string[]
}

export const MODEL_FILE_MAX_BYTES = 64 * 1024 * 1024
export const MODEL_TOTAL_MAX_BYTES = 256 * 1024 * 1024
export const MODEL3_SUFFIX = '.model3.json'
export const MODEL_MAP_FILE = 'model-map.json'
export const CORE_FILE = 'live2dcubismcore.min.js'
export const MODEL_PROTOCOL = 'kmd-model'

const EXTENSIONS: Record<string, string[]> = {
  moc: ['.moc3'],
  texture: ['.png', '.jpg', '.jpeg', '.webp'],
  motion: ['.motion3.json'],
  expression: ['.exp3.json'],
  physics: ['.physics3.json'],
  pose: ['.pose3.json'],
  userdata: ['.userdata3.json'],
  displayinfo: ['.cdi3.json']
}

type Json = Record<string, unknown>

function obj(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

// 모델 폴더 밖 참조·원격 URL·실행 파일 차단. 확장자 허용 목록이라 .exe/.js 류는 애초에 통과하지 못한다.
export function checkModelRef(kind: keyof typeof EXTENSIONS, ref: unknown): string {
  if (typeof ref !== 'string' || !ref.trim()) throw new Error(`${kind} 참조가 비어 있어요`)
  const path = ref.replace(/\\/g, '/')
  if (/^([a-z]+:|\/)/i.test(path) || path.includes('://')) throw new Error(`절대 경로·원격 참조는 허용하지 않아요: ${ref}`)
  if (path.split('/').some((seg) => seg === '..' || seg === '')) throw new Error(`모델 폴더 밖 참조는 허용하지 않아요: ${ref}`)
  const lower = path.toLowerCase()
  if (!EXTENSIONS[kind].some((ext) => lower.endsWith(ext))) throw new Error(`${kind} 파일 형식이 아니에요: ${ref}`)
  return path
}

export function inspectModel3(json: unknown): Model3Summary {
  const root = obj(json)
  const refs = obj(root.FileReferences)
  if (!refs.Moc) throw new Error('FileReferences.Moc 가 없어요')
  const moc = checkModelRef('moc', refs.Moc)
  const files = new Set<string>([moc])
  const textures = Array.isArray(refs.Textures) ? refs.Textures : []
  if (textures.length === 0) throw new Error('FileReferences.Textures 가 비어 있어요')
  const textureRefs = textures.map((t) => checkModelRef('texture', t))
  textureRefs.forEach((t) => files.add(t))
  for (const key of ['physics', 'pose', 'userdata', 'displayinfo'] as const) {
    const ref = refs[{ physics: 'Physics', pose: 'Pose', userdata: 'UserData', displayinfo: 'DisplayInfo' }[key]]
    if (ref) files.add(checkModelRef(key, ref))
  }
  const motions: Record<string, string[]> = {}
  for (const [group, entries] of Object.entries(obj(refs.Motions))) {
    if (!Array.isArray(entries)) continue
    motions[group] = entries.map((entry) => checkModelRef('motion', obj(entry).File))
    motions[group].forEach((f) => files.add(f))
  }
  const expressions: Record<string, string> = {}
  for (const entry of Array.isArray(refs.Expressions) ? refs.Expressions : []) {
    const { Name, File } = obj(entry)
    if (typeof Name !== 'string') continue
    expressions[Name] = checkModelRef('expression', File)
    files.add(expressions[Name])
  }
  const groups = Array.isArray(root.Groups) ? root.Groups.map(obj) : []
  const ids = (name: string): string[] => {
    const g = groups.find((x) => x.Target === 'Parameter' && x.Name === name)
    return Array.isArray(g?.Ids) ? g.Ids.filter((id): id is string => typeof id === 'string') : []
  }
  const hitAreas = (Array.isArray(root.HitAreas) ? root.HitAreas.map(obj) : [])
    .filter((h) => typeof h.Id === 'string')
    .map((h) => ({ id: h.Id as string, name: typeof h.Name === 'string' ? h.Name : (h.Id as string) }))
  return { moc, textures: textureRefs, files: [...files], motions, expressions, hitAreas, eyeBlinkIds: ids('EyeBlink'), lipSyncIds: ids('LipSync') }
}

export function modelFileUrl(modelId: string, relPath: string): string {
  return `${MODEL_PROTOCOL}://models/${modelId}/${relPath.split('/').map(encodeURIComponent).join('/')}`
}

export function coreScriptUrl(): string {
  return `${MODEL_PROTOCOL}://core/${CORE_FILE}`
}
