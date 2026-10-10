import { describe, expect, it } from 'vitest'
import { parsePhysics3, stepPhysics, type ParamAccess } from '../../src/character/live2dPhysics'

const physics = {
  Version: 3,
  Meta: { EffectiveForces: { Gravity: { X: 0, Y: -1 }, Wind: { X: 0, Y: 0 } } },
  PhysicsSettings: [
    {
      Id: 'PhysicsSetting_Hair',
      Input: [{ Source: { Target: 'Parameter', Id: 'ParamAngleX' }, Weight: 100, Type: 'X', Reflect: false }],
      Output: [{ Destination: { Target: 'Parameter', Id: 'ParamHair' }, VertexIndex: 2, Scale: 4, Weight: 100, Type: 'Angle', Reflect: false }],
      Vertices: [
        { Position: { X: 0, Y: 0 }, Mobility: 1, Delay: 1, Acceleration: 1, Radius: 0 },
        { Position: { X: 0, Y: 8 }, Mobility: 0.95, Delay: 0.8, Acceleration: 1.5, Radius: 8 },
        { Position: { X: 0, Y: 16 }, Mobility: 0.9, Delay: 0.8, Acceleration: 1.5, Radius: 8 }
      ],
      Normalization: { Position: { Minimum: -10, Default: 0, Maximum: 10 }, Angle: { Minimum: -10, Default: 0, Maximum: 10 } }
    }
  ]
}

function store(): ParamAccess & { v: Record<string, number> } {
  const v: Record<string, number> = { ParamAngleX: 0, ParamHair: 0 }
  const ranges: Record<string, [number, number]> = { ParamAngleX: [-30, 30], ParamHair: [-1, 1] }
  return { v, get: (id) => v[id], range: (id) => ranges[id], set: (id, x) => (v[id] = x) }
}

describe('live2dPhysics', () => {
  it('고개를 돌리면 머리카락이 흔들리다가 멈춘다', () => {
    const data = parsePhysics3(physics)
    expect(data.settings).toHaveLength(1)
    const p = store()
    for (let i = 0; i < 10; i++) stepPhysics(data, p, 1 / 60)
    expect(p.v.ParamHair).toBe(0)
    p.v.ParamAngleX = 30
    let peak = 0
    for (let i = 0; i < 30; i++) {
      stepPhysics(data, p, 1 / 60)
      peak = Math.max(peak, Math.abs(p.v.ParamHair))
    }
    expect(peak).toBeGreaterThan(0.2)
    expect(peak).toBeLessThanOrEqual(1)
    for (let i = 0; i < 600; i++) stepPhysics(data, p, 1 / 60)
    expect(Math.abs(p.v.ParamHair)).toBeLessThan(0.02)
  })

  it('깨진 입력은 설정을 버린다', () => {
    expect(parsePhysics3({ Version: 3, Meta: {}, PhysicsSettings: [{ Vertices: [] }] }).settings).toEqual([])
    expect(parsePhysics3(null).settings).toEqual([])
  })
})
