import { z } from 'zod'

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const WindowSchema = z.object({
  alwaysOnTop: z.boolean().default(true),
  scale: z.number().min(0.5).max(2).default(1),
  opacity: z.number().min(0.2).max(1).default(1),
  x: z.number().int().nullable().default(null),
  y: z.number().int().nullable().default(null)
})

const CharacterSchema = z.object({
  activeModelId: z.string().min(1).default('placeholder'),
  mirror: z.boolean().default(false)
})

const BehaviorSchema = z.object({
  enabled: z.boolean().default(true),
  proactiveDialogue: z.boolean().default(true),
  dailyProactiveLimit: z.number().int().min(0).max(50).default(3),
  minimumProactiveIntervalMinutes: z.number().int().min(1).default(90),
  quietHours: z
    .object({
      enabled: z.boolean().default(true),
      start: timeString.default('23:00'),
      end: timeString.default('08:00')
    })
    .prefault({}),
  doNotDisturb: z.boolean().default(false)
})

const DisplaySchema = z.object({
  speechBubbleSeconds: z.number().min(2).max(30).default(6),
  fpsLimit: z.union([z.literal(30), z.literal(60)]).default(60),
  reduceMotion: z.boolean().default(false),
  textScale: z.number().min(0.8).max(1.5).default(1)
})

const GeneralSchema = z.object({
  autoStart: z.boolean().default(false),
  language: z.literal('ko').default('ko')
})

const PrivacySchema = z.object({
  analytics: z.literal(false).default(false)
})

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  general: GeneralSchema.prefault({}),
  window: WindowSchema.prefault({}),
  character: CharacterSchema.prefault({}),
  behavior: BehaviorSchema.prefault({}),
  display: DisplaySchema.prefault({}),
  privacy: PrivacySchema.prefault({})
})

export type Settings = z.infer<typeof SettingsSchema>

// IPC로 들어오는 부분 갱신. zod 4에는 deepPartial이 없어 섹션별로 명시한다.
export const SettingsPatchSchema = z
  .object({
    general: GeneralSchema.partial(),
    window: WindowSchema.partial(),
    character: CharacterSchema.partial(),
    behavior: BehaviorSchema.omit({ quietHours: true })
      .partial()
      .extend({ quietHours: BehaviorSchema.shape.quietHours.unwrap().partial().optional() }),
    display: DisplaySchema.partial(),
    privacy: PrivacySchema.partial()
  })
  .partial()
  .strict()

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const merged: Record<string, unknown> = { ...current }
  for (const [section, value] of Object.entries(patch)) {
    if (!value) continue
    const base = current[section as keyof Settings] as Record<string, unknown>
    const next: Record<string, unknown> = { ...base, ...value }
    if (section === 'behavior' && (value as SettingsPatch['behavior'])?.quietHours) {
      next.quietHours = { ...(base.quietHours as object), ...(value as SettingsPatch['behavior'])!.quietHours }
    }
    merged[section] = next
  }
  return SettingsSchema.parse(merged)
}
