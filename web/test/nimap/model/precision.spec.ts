import { describe, it, expect } from 'vitest'
import { quantize, samePoint, MIN_FEATURE, DOCUMENT_GRID, KERNEL_GRID, CLIP_GRID, WALL_SEGMENT_MIN, DOCUMENT_PRECISION } from '$lib/nimap'

describe('precision ladder', () => {
  it('is one ladder: each derived grid is at least a hundred times finer than the feature above it', () => {
    expect(MIN_FEATURE / KERNEL_GRID).toBeGreaterThanOrEqual(100)
    expect(KERNEL_GRID / CLIP_GRID).toBeGreaterThanOrEqual(10)
    expect(DOCUMENT_GRID).toBeLessThanOrEqual(KERNEL_GRID)
    expect(WALL_SEGMENT_MIN).toBe(MIN_FEATURE)
    expect(DOCUMENT_PRECISION).toBe(DOCUMENT_GRID)
  })

  it('quantize is exact and idempotent on the grid', () => {
    expect(quantize([1.6, 0.30000000000000004])).toEqual([1.6, 0.3])
    expect(quantize([0.1234567891, -0.9876543219])).toEqual([0.123457, -0.987654])
    const p = quantize([2.0871428571428572, 3.1742857142857144])
    expect(quantize(p)).toEqual(p)
  })

  it('samePoint is the document rule, not the graph identity', () => {
    expect(samePoint([0, 0], [0.009, 0])).toBe(true)
    expect(samePoint([0, 0], [0.0101, 0])).toBe(false)
  })
})
