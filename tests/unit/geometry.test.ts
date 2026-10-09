import { describe, expect, it } from 'vitest'
import { clampToArea } from '@shared/geometry'

const area = { x: 0, y: 0, width: 1920, height: 1040 }

describe('clampToArea', () => {
  it('화면 안에 있으면 그대로 둔다', () => {
    expect(clampToArea({ x: 100, y: 200, width: 320, height: 400 }, area)).toEqual({ x: 100, y: 200, width: 320, height: 400 })
  })

  it('화면 밖(분리된 모니터 좌표)이면 가장자리로 끌어온다', () => {
    expect(clampToArea({ x: 2500, y: -300, width: 320, height: 400 }, area)).toMatchObject({ x: 1600, y: 0 })
    expect(clampToArea({ x: -900, y: 3000, width: 320, height: 400 }, area)).toMatchObject({ x: 0, y: 640 })
  })

  it('보조 모니터 작업 영역 오프셋을 반영한다', () => {
    const second = { x: 1920, y: 100, width: 1280, height: 680 }
    expect(clampToArea({ x: 5000, y: 5000, width: 320, height: 400 }, second)).toMatchObject({ x: 2880, y: 380 })
  })
})
