import type { DialogueProvider, DialogueRequest, DialogueResponse, TimeOfDay } from '@shared/types'
import { GREETING_LINES, INTENT_LINES, INTENT_RULES, PROACTIVE_LINES, type Intent, type ScriptLine } from './dialogueScript'

// FR-006 규칙 기반 대화. 키워드·정규식으로 의도를 결정적으로 고르고, 의도별 대사는 직전 대사를 피해 무작위로 뽑는다.
// 자유 자연어 이해는 하지 않으며 모르는 문장은 unknown 대사로 솔직하게 답한다.

export function normalizeUtterance(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

export function matchIntent(text: string): Intent {
  const compact = normalizeUtterance(text)
  if (!compact) return 'unknown'
  return INTENT_RULES.find((rule) => rule.pattern.test(compact))?.intent ?? 'unknown'
}

export class ScriptedDialogueProvider implements DialogueProvider {
  private lastText = new Map<string, string>()

  constructor(private readonly random: () => number = Math.random) {}

  respond(request: DialogueRequest): Promise<DialogueResponse> {
    const intent = matchIntent(request.text)
    const { timeOfDay } = request.context
    const pool = intent === 'greeting' ? GREETING_LINES[timeOfDay] : INTENT_LINES[intent]
    const line = this.pick(intent === 'greeting' ? `greeting:${timeOfDay}` : intent, pool)
    return Promise.resolve(this.toResponse(line, intent))
  }

  proactive(timeOfDay: TimeOfDay): DialogueResponse {
    return this.toResponse(this.pick(`proactive:${timeOfDay}`, PROACTIVE_LINES[timeOfDay]), 'proactive')
  }

  // 같은 키에서 직전 대사는 제외한다(후보가 하나뿐이면 허용).
  private pick(key: string, pool: readonly ScriptLine[]): ScriptLine {
    const last = this.lastText.get(key)
    const candidates = pool.length > 1 ? pool.filter((line) => line.text !== last) : pool
    const line = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))]
    this.lastText.set(key, line.text)
    return line
  }

  private toResponse(line: ScriptLine, intent: string): DialogueResponse {
    const response: DialogueResponse = { text: line.text, emotion: line.emotion, intent, source: 'script' }
    if (line.motion) response.motion = line.motion
    return response
  }
}
