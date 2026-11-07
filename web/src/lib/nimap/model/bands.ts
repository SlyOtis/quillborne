import type { StripCut } from '../geometry/walls'
import type { Opening, Wall } from './types'
import { openingCuts } from './openings'

/** A horizontal slice of the walls: between two heights, the same openings pass through every wall. */
export interface WallBand {
  from: number
  to: number
  cuts: StripCut[]
}

/**
 * The walls sliced at every height where an opening starts or ends or a
 * wall of its own height ends, so each band is solid geometry with the same
 * walls and the same holes all the way through it. A door
 * from the floor to its head cuts every band up to that head; a window cuts
 * only the bands between its sill and its head, so the wall below it and the
 * lintel above come out of the ordinary wall solve. Nothing is subtracted in
 * three dimensions.
 */
export function wallBands(walls: Wall[], openings: Opening[], height: number): WallBand[] {
  const heights = new Set<number>([0, height])
  for (const o of openings) for (const h of [o.from, o.to]) if (h > 0 && h < height) heights.add(h)
  for (const w of walls) if (w.height !== undefined && w.height > 0 && w.height < height) heights.add(w.height)
  const sorted = [...heights].sort((a, b) => a - b)
  return sorted.slice(1).map((to, i) => {
    const from = sorted[i]
    const through = openings.filter(o => o.from <= from && o.to >= to)
    return { from, to, cuts: openingCuts(through, walls) }
  })
}
