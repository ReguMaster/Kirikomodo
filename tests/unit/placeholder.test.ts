import { describe, expect, it } from 'vitest'
import { sampleTrack } from '@/character/PlaceholderRenderer'

describe('sampleTrack', () => {
  const track: [number, number][] = [[0, 0], [0.5, 10], [1, 0]]

  it('키프레임 경계에서 정확한 값을 돌려준다', () => {
    expect(sampleTrack(track, 0)).toBe(0)
    expect(sampleTrack(track, 0.5)).toBe(10)
    expect(sampleTrack(track, 1)).toBe(0)
  })

  it('구간 사이는 smoothstep으로 보간하고 범위를 넘으면 끝값을 유지한다', () => {
    expect(sampleTrack(track, 0.25)).toBeCloseTo(5)
    expect(sampleTrack(track, 0.1)).toBeLessThan(2)
    expect(sampleTrack(track, 2)).toBe(0)
    expect(sampleTrack(track, -1)).toBe(0)
  })
})
