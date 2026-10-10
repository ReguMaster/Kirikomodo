import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkModelRef, inspectModel3, modelFileUrl } from '@shared/live2d'
import { evaluateCurve, motionWeight, parseExpression3, parseMotion3 } from '@/character/live2dMotion'

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/live2d/model/fixture.model3.json'), 'utf8')) as unknown

describe('inspectModel3', () => {
  it('collects referenced files, groups and hit areas from the fixture', () => {
    const summary = inspectModel3(fixture)
    expect(summary.moc).toBe('fixture.moc3')
    expect(summary.textures).toEqual(['textures/texture_00.png'])
    expect(summary.files).toEqual(['fixture.moc3', 'textures/texture_00.png', 'fixture.physics3.json', 'motions/idle_01.motion3.json'])
    expect(summary.motions).toEqual({ Idle: ['motions/idle_01.motion3.json'] })
    expect(summary.hitAreas).toEqual([{ id: 'HitAreaHead', name: 'Head' }])
    expect(summary.eyeBlinkIds).toEqual(['ParamEyeLOpen', 'ParamEyeROpen'])
    expect(summary.lipSyncIds).toEqual(['ParamMouthOpenY'])
  })

  it('rejects escapes, remote urls, executables and missing moc', () => {
    expect(() => checkModelRef('texture', '../secret.png')).toThrow('모델 폴더 밖')
    expect(() => checkModelRef('texture', 'C:/evil.png')).toThrow('절대 경로')
    expect(() => checkModelRef('moc', 'https://example.com/a.moc3')).toThrow('절대 경로')
    expect(() => checkModelRef('motion', 'motions/run.exe')).toThrow('파일 형식')
    expect(() => checkModelRef('texture', 'tex\\..\\x.png')).toThrow('모델 폴더 밖')
    expect(() => inspectModel3({ FileReferences: { Textures: ['a.png'] } })).toThrow('Moc')
    expect(() => inspectModel3({ FileReferences: { Moc: 'a.moc3' } })).toThrow('Textures')
  })

  it('builds encoded protocol urls', () => {
    expect(modelFileUrl('kiriko', 'motions/idle 01.motion3.json')).toBe('kmd-model://models/kiriko/motions/idle%2001.motion3.json')
  })
})

describe('motion curves', () => {
  it('evaluates linear, stepped and bezier segments', () => {
    const linear = [0, 0, 0, 1, 10]
    expect(evaluateCurve(linear, 0.5)).toBeCloseTo(5)
    expect(evaluateCurve(linear, 2)).toBe(10)
    const stepped = [0, 1, 2, 1, 5, 3, 2, 9]
    expect(evaluateCurve(stepped, 0.5)).toBe(1)
    expect(evaluateCurve(stepped, 1.5)).toBe(9)
    const bezier = [0, 0, 1, 0.33, 0, 0.67, 1, 1, 1]
    expect(evaluateCurve(bezier, 0)).toBeCloseTo(0)
    expect(evaluateCurve(bezier, 1)).toBeCloseTo(1)
    expect(evaluateCurve(bezier, 0.5)).toBeCloseTo(0.5)
  })

  it('parses motion3/exp3 and fades weight', () => {
    const motion = parseMotion3({
      Meta: { Duration: 2, Loop: false, FadeInTime: 0.5, FadeOutTime: 0.5 },
      Curves: [{ Target: 'Parameter', Id: 'ParamAngleX', Segments: [0, 0, 0, 2, 30] }, { Target: 'Bogus', Id: 'x', Segments: [0, 0] }]
    })
    expect(motion.curves).toHaveLength(1)
    expect(motionWeight(motion, 0.25)).toBeCloseTo(0.5)
    expect(motionWeight(motion, 1)).toBe(1)
    expect(motionWeight(motion, 1.75)).toBeCloseTo(0.5)
    expect(motionWeight({ ...motion, loop: true }, 1.9)).toBe(1)
    const exp = parseExpression3({ FadeInTime: 0.2, Parameters: [{ Id: 'ParamMouthForm', Value: 1 }, { Id: 'ParamCheek', Value: 0.5, Blend: 'Overwrite' }] })
    expect(exp.params).toEqual([
      { id: 'ParamMouthForm', value: 1, blend: 'Add' },
      { id: 'ParamCheek', value: 0.5, blend: 'Overwrite' }
    ])
  })
})
