import type { CharacterRenderer } from '@shared/types'
import { Live2DRenderer } from './Live2DRenderer'
import { PlaceholderRenderer, type PlaceholderOptions } from './PlaceholderRenderer'

export type RendererKind = 'placeholder' | 'live2d'

export interface ManagedRenderer extends CharacterRenderer {
  setOptions(options: Partial<PlaceholderOptions>): void
}

export interface MountedRenderer {
  renderer: ManagedRenderer
  kind: RendererKind
  /** Live2D 로드에 실패해 플레이스홀더로 폴백한 이유. 정상이면 null. */
  fallbackReason: string | null
}

// 렌더러 선택 지점. 모델이 지정돼 있으면 Live2D를 시도하고, Core/모델/WebGL 문제는 모두 플레이스홀더로 폴백한다.
export async function createCharacterRenderer(modelId: string, container: HTMLElement, options: Partial<PlaceholderOptions> = {}): Promise<MountedRenderer> {
  let fallbackReason: string | null = null
  if (modelId !== 'placeholder') {
    try {
      const { models } = await window.kirikomodo.listModels()
      const info = models.find((m) => m.id === modelId)
      if (!info) throw new Error(`등록되지 않은 모델이에요: ${modelId}`)
      const live2d = new Live2DRenderer(info, options)
      await live2d.mount(container)
      return { renderer: live2d, kind: 'live2d', fallbackReason: null }
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : String(err)
      console.error(`[live2d] ${modelId} 로드 실패, 플레이스홀더로 폴백:`, fallbackReason)
    }
  }
  const placeholder = new PlaceholderRenderer(options)
  await placeholder.mount(container)
  return { renderer: placeholder, kind: 'placeholder', fallbackReason }
}
