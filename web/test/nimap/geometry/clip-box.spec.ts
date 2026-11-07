import { describe, it, expect } from 'vitest'
import { clipSegmentToBox } from '$lib/nimap'

const box = { minX: 0, minY: 0, maxX: 10, maxY: 5 }

describe('clipSegmentToBox', () => {
  it('keeps the visible part of a ray, drops what misses, leaves an inside segment alone', () => {
    expect(clipSegmentToBox([2, 2], [2, 10002], box)).toEqual([[2, 2], [2, 5]])
    expect(clipSegmentToBox([-5, 1], [15, 3], box)).toEqual([[0, 1.5], [10, 2.5]])
    expect(clipSegmentToBox([1, 1], [3, 3], box)).toEqual([[1, 1], [3, 3]])
    expect(clipSegmentToBox([-5, 7], [15, 7], box)).toBeNull()
    expect(clipSegmentToBox([12, 0], [12, 5], box)).toBeNull()
  })
})
