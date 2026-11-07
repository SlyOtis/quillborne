import { describe, it, expect } from 'vitest'
import { createSelectTool, createLevel } from '$lib/nimap'
import type { Wall, Vec2 } from '$lib/nimap'
import { harness } from './harness'

const ROOM = 3
const COLS = 25
const ROWS = 20

/** A traced-plan shape: every room edge its own wall, so junctions come from coincidence. */
function grid(): Wall[] {
  const walls: Wall[] = []
  for (let r = 0; r <= ROWS; r++) for (let c = 0; c < COLS; c++) walls.push({ id: `h${r}-${c}`, points: [[c * ROOM, r * ROOM], [(c + 1) * ROOM, r * ROOM]], width: 0.16 })
  for (let c = 0; c <= COLS; c++) for (let r = 0; r < ROWS; r++) walls.push({ id: `v${c}-${r}`, points: [[c * ROOM, r * ROOM], [c * ROOM, (r + 1) * ROOM]], width: 0.16 })
  return walls
}

function dragBlock(cols: number, rows: number, moves: number) {
  const tool = createSelectTool()
  const h = harness(tool, createLevel({ name: 'L', walls: grid() }))
  h.down([-0.5, -0.5])
  h.move([(cols - 1) * ROOM + 0.5, (rows - 1) * ROOM + 0.5])
  h.up([(cols - 1) * ROOM + 0.5, (rows - 1) * ROOM + 0.5])
  expect(h.store.selection.nodeIds.size).toBe(cols * rows)
  h.down([ROOM / 2, ROOM / 2])
  const started = performance.now()
  for (let i = 1; i <= moves; i++) {
    const p: Vec2 = [ROOM / 2 + 0.37 * i, ROOM / 2 + 0.23 * i]
    h.move(p)
    const request = h.trace.requests[h.trace.requests.length - 1]
    expect(request.offsets!.length).toBeLessThanOrEqual(Math.min(cols * rows, 8))
    expect(tool.data.cursor!.active.length).toBeLessThanOrEqual(8)
  }
  const perMove = (performance.now() - started) / moves
  h.up([ROOM / 2 + 0.37 * moves, ROOM / 2 + 0.23 * moves])
  expect(h.trace.snappersBuilt).toBe(1)
  return perMove
}

/** Timings judge this code on a developer's machine; on a shared CI machine they would judge the machine. */
describe.skipIf(!!process.env.CI)('dragging on a 500-room plan', () => {
  it('moving 8 nodes stays bounded per move', () => {
    const perMove = dragBlock(4, 2, 20)
    console.log(`8 nodes: ${perMove.toFixed(1)} ms per move`)
    expect(perMove).toBeLessThan(250)
  })

  it('moving 250 nodes collapses offsets to a bounding box and stays bounded per move', { timeout: 30_000 }, () => {
    const perMove = dragBlock(25, 10, 20)
    console.log(`250 nodes: ${perMove.toFixed(1)} ms per move`)
    expect(perMove).toBeLessThan(250)
  })
})
