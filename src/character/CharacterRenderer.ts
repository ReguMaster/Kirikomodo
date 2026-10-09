import type { CharacterRenderer } from '@shared/types'
import { PlaceholderRenderer, type PlaceholderOptions } from './PlaceholderRenderer'

export type RendererKind = 'placeholder' | 'live2d'

export interface ManagedRenderer extends CharacterRenderer {
  setOptions(options: Partial<PlaceholderOptions>): void
}

// 렌더러 선택 지점. Live2D 로더가 붙으면 여기서 모델 유무로 분기하고 실패 시 플레이스홀더로 폴백한다.
export function createCharacterRenderer(_kind: RendererKind, options: Partial<PlaceholderOptions> = {}): ManagedRenderer {
  return new PlaceholderRenderer(options)
}
