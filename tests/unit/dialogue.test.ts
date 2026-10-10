import { describe, expect, it } from 'vitest'
import { ScriptedDialogueProvider, matchIntent } from '@/core/ScriptedDialogueProvider'
import { GREETING_LINES, INTENT_LINES, INTENTS, PROACTIVE_LINES } from '@/core/dialogueScript'
import { EMOTIONS, MOTIONS, type DialogueRequest } from '@shared/types'

const req = (text: string, timeOfDay: DialogueRequest['context']['timeOfDay'] = 'day'): DialogueRequest => ({
  text,
  now: '2026-10-10T12:00:00.000Z',
  context: { timeOfDay }
})

describe('matchIntent', () => {
  it('한국어 키워드를 의도로 라우팅한다', () => {
    expect(matchIntent('안녕!')).toBe('greeting')
    expect(matchIntent('좋은 아침')).toBe('greeting')
    expect(matchIntent('뭐 해?')).toBe('status')
    expect(matchIntent('오늘 코딩 많이 해야 해')).toBe('work')
    expect(matchIntent('너무 피곤하다')).toBe('break')
    expect(matchIntent('잘 자')).toBe('goodnight')
    expect(matchIntent('고마워')).toBe('thanks')
    expect(matchIntent('농담 하나 해줘')).toBe('joke')
    expect(matchIntent('도움말')).toBe('help')
    expect(matchIntent('Thanks!')).toBe('thanks')
  })

  it('구체적인 의도가 인사보다 우선한다', () => {
    expect(matchIntent('안녕, 잘 자')).toBe('goodnight')
    expect(matchIntent('안녕 고마워')).toBe('thanks')
  })

  it('인식 불가 문장과 빈 문장은 unknown', () => {
    expect(matchIntent('양자역학에 대해 설명해줘')).toBe('help')
    expect(matchIntent('오늘 날씨가 흐리네')).toBe('unknown')
    expect(matchIntent('   ')).toBe('unknown')
    expect(matchIntent('this')).toBe('unknown')
  })
})

describe('ScriptedDialogueProvider', () => {
  it('의도에 맞는 대사와 감정·모션을 돌려준다', async () => {
    const provider = new ScriptedDialogueProvider(() => 0)
    const res = await provider.respond(req('고마워'))
    expect(res.intent).toBe('thanks')
    expect(res.source).toBe('script')
    expect(INTENT_LINES.thanks.map((l) => l.text)).toContain(res.text)
    expect(EMOTIONS).toContain(res.emotion)
  })

  it('인사는 시간대별 대사를 쓴다', async () => {
    const provider = new ScriptedDialogueProvider(() => 0)
    const night = await provider.respond(req('안녕', 'night'))
    expect(GREETING_LINES.night.map((l) => l.text)).toContain(night.text)
  })

  it('같은 의도에서 같은 대사를 연달아 내지 않는다', async () => {
    const provider = new ScriptedDialogueProvider(() => 0)
    const texts = new Set<string>()
    let prev = ''
    for (let i = 0; i < 12; i++) {
      const { text } = await provider.respond(req('뭐해'))
      expect(text).not.toBe(prev)
      prev = text
      texts.add(text)
    }
    expect(texts.size).toBeGreaterThan(1)
  })

  it('선제 발화도 시간대별로 중복을 피한다', () => {
    const provider = new ScriptedDialogueProvider(() => 0.99)
    const a = provider.proactive('morning')
    const b = provider.proactive('morning')
    expect(a.intent).toBe('proactive')
    expect(PROACTIVE_LINES.morning.map((l) => l.text)).toContain(a.text)
    expect(a.text).not.toBe(b.text)
  })

  it('모든 대사의 감정·모션은 계약에 있는 값이다', () => {
    const lines = [
      ...Object.values(INTENT_LINES).flat(),
      ...Object.values(GREETING_LINES).flat(),
      ...Object.values(PROACTIVE_LINES).flat()
    ]
    for (const line of lines) {
      expect(EMOTIONS).toContain(line.emotion)
      if (line.motion) expect(MOTIONS).toContain(line.motion)
      expect(line.text.length).toBeGreaterThan(0)
    }
    for (const intent of INTENTS) {
      if (intent !== 'greeting') expect(INTENT_LINES[intent].length).toBeGreaterThanOrEqual(2)
    }
  })
})
