import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsPatchSchema, SettingsSchema, applySettingsPatch } from '@shared/settings'

describe('SettingsSchema', () => {
  it('fills nested defaults from an empty object', () => {
    expect(DEFAULT_SETTINGS.window.alwaysOnTop).toBe(true)
    expect(DEFAULT_SETTINGS.behavior.quietHours).toEqual({ enabled: true, start: '23:00', end: '08:00' })
    expect(DEFAULT_SETTINGS.character.activeModelId).toBe('placeholder')
  })

  it('fills missing sections when parsing a partial file', () => {
    const parsed = SettingsSchema.parse({ window: { scale: 1.5 } })
    expect(parsed.window.scale).toBe(1.5)
    expect(parsed.window.opacity).toBe(1)
    expect(parsed.behavior.dailyProactiveLimit).toBe(3)
    expect(parsed.dialogue.scriptedEnabled).toBe(true)
  })

  it('rejects out-of-range and malformed values', () => {
    expect(SettingsSchema.safeParse({ window: { scale: 5 } }).success).toBe(false)
    expect(SettingsSchema.safeParse({ behavior: { quietHours: { start: '25:00' } } }).success).toBe(false)
    expect(SettingsPatchSchema.safeParse({ unknownSection: {} }).success).toBe(false)
  })

  it('applies a deep patch without dropping sibling values', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, { behavior: { quietHours: { start: '22:00' } }, window: { x: 10, y: 20 } })
    expect(next.behavior.quietHours).toEqual({ enabled: true, start: '22:00', end: '08:00' })
    expect(next.behavior.dailyProactiveLimit).toBe(3)
    expect(next.window).toMatchObject({ x: 10, y: 20, alwaysOnTop: true })
    expect(DEFAULT_SETTINGS.window.x).toBeNull()
  })
})
