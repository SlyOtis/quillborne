import { describe, it, expect } from 'vitest'
import { cameraDirection, turnToward, viewOf } from '$lib/nimap/render'

describe('the camera’s view', () => {
  it('a view read back from its direction is the same view, every turn and every height but straight down', () => {
    for (let turn = -180; turn < 180; turn += 7.5) {
      for (let down = 5; down < 90; down += 5) {
        const back = viewOf(cameraDirection({ turn, down }))
        expect(back.down).toBeCloseTo(down, 9)
        expect(((back.turn - turn) % 360 + 360) % 360 % 360, `${turn}° ${down}°`).toBeCloseTo(0, 9)
      }
    }
  })

  it('a turn goes the shorter way round, ending on the same bearing', () => {
    for (let from = -720; from <= 720; from += 30) {
      for (let to = -720; to <= 720; to += 45) {
        const end = turnToward(from, to)
        expect(Math.abs(end - from), `${from}° to ${to}°`).toBeLessThanOrEqual(180)
        expect((((end - to) % 360) + 360) % 360, `${from}° to ${to}°`).toBeCloseTo(0, 9)
      }
    }
  })
})
