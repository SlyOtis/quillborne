import { describe, it, expect } from 'vitest'
import { applyCommand, createLevel, validateLevel } from '$lib/nimap'
import { calibratedScale, createReference, referenceExtent, imagePixelToDocument } from '$lib/nimap-editor/calibration'

describe('calibration', () => {
  const reference = createReference({ url: 'x', widthPx: 1000, heightPx: 500 })

  it('starts uncalibrated at the default scale', () => {
    expect(reference.calibrated).toBe(false)
    expect(referenceExtent(reference)).toEqual({ width: 10, height: 5 })
    expect(imagePixelToDocument(reference, [100, 200])).toEqual([1, -2])
  })

  it('derives the scale from two points and a real distance', () => {
    expect(calibratedScale(reference, [1, 0], [3, 0], 4)).toBeCloseTo(0.02, 12)
    expect(calibratedScale(reference, [0, 0], [3, 4], 10)).toBeCloseTo(0.02, 12)
    expect(() => calibratedScale(reference, [1, 1], [1, 1], 4)).toThrow(/apart/)
    expect(() => calibratedScale(reference, [0, 0], [1, 0], 0)).toThrow(/positive/)
  })

  it('stores the reference on the level through a command and validates', () => {
    const level = createLevel({ name: 'L' })
    const withReference = applyCommand(level, { type: 'setReference', reference })
    validateLevel(withReference)
    expect(withReference.reference?.widthPx).toBe(1000)
    expect(level.reference).toBeUndefined()
    const cleared = applyCommand(withReference, { type: 'setReference', reference: null })
    expect('reference' in cleared).toBe(false)
    expect(() => validateLevel(applyCommand(level, { type: 'setReference', reference: { ...reference, metresPerPixel: 0 } }))).toThrow(/scale/)
  })

  it('edits unit metadata without touching geometry', () => {
    const level = createLevel({ name: 'L', units: [{ id: 'u', name: '', category: 'unspecified', signature: 's', polygon: { outer: [[0, 0], [1, 0], [1, 1]], holes: [] }, anchor: [0.5, 0.3], hidden: false }] })
    const next = applyCommand(level, { type: 'setUnit', unitId: 'u', patch: { name: 'Lobby', category: 'lobby', hidden: true, ref: { kind: 'room', id: 'r1' } } })
    expect(next.units[0]).toMatchObject({ name: 'Lobby', category: 'lobby', hidden: true, ref: { kind: 'room', id: 'r1' } })
    expect(next.units[0].polygon).toEqual(level.units[0].polygon)
    expect(level.units[0].name).toBe('')
  })
})

describe('aligning an image onto a drawing', () => {
  it('the two points clicked on the image land exactly on the two points of the drawing, whatever scale and place the image had; clicks a little off split the error evenly', async () => {
    const { alignReference, documentToImagePixel, imagePixelToDocument, createReference } = await import('$lib/nimap-editor/calibration')
    for (const [scale, origin] of [[0.01, [0, 0]], [0.037, [12, -4]], [0.5, [-30, 18]]] as [number, [number, number]][]) {
      const before = { ...createReference({ url: 'x', widthPx: 2000, heightPx: 1200, metresPerPixel: scale }), origin }
      const imageA: [number, number] = [origin[0] + 300 * scale, origin[1] - 200 * scale]
      const imageB: [number, number] = [origin[0] + 1500 * scale, origin[1] - 900 * scale]
      const k = 0.8
      const drawingA: [number, number] = [3, 2]
      const drawingB: [number, number] = [3 + (imageB[0] - imageA[0]) * k, 2 + (imageB[1] - imageA[1]) * k]
      const after = alignReference(before, imageA, imageB, drawingA, drawingB)
      for (const [clicked, target] of [[imageA, drawingA], [imageB, drawingB]] as const) {
        const landed = imagePixelToDocument(after, documentToImagePixel(before, clicked))
        expect(landed[0]).toBeCloseTo(target[0], 9)
        expect(landed[1]).toBeCloseTo(target[1], 9)
      }
      expect(after.calibrated).toBe(true)
      const off: [number, number] = [drawingB[0] + 0.1, drawingB[1]]
      const near = alignReference(before, imageA, imageB, drawingA, off)
      const errors = [[imageA, drawingA], [imageB, off]].map(([clicked, target]) => {
        const landed = imagePixelToDocument(near, documentToImagePixel(before, clicked as [number, number]))
        return Math.hypot(landed[0] - target[0], landed[1] - target[1])
      })
      expect(errors[0]).toBeCloseTo(errors[1], 9)
      expect(errors[0]).toBeLessThan(0.1)
    }
  })

  it('once anything is drawn, a new image never locks the tools, and calibrating it aligns rather than rescales', async () => {
    const { Editor } = await import('$lib/nimap-editor/editor.svelte')
    const { createLevel } = await import('$lib/nimap')
    const editor = new Editor({ level: createLevel({ name: 'L', walls: [{ id: 'a', points: [[0, 0], [4, 0]], width: 0.16 }] }) })
    editor.setReference({ url: 'new.png', widthPx: 800, heightPx: 600 })
    expect(editor.reference?.calibrated).toBe(false)
    expect(editor.calibrated).toBe(true)
    editor.startCalibration()
    expect(editor.calibration.mode).toBe('align')
  })
})
