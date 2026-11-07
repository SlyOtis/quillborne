/** Wall widths a hand can mean, in metres, and how a key steps them. Below the thinnest wall is 0, an edge that stands no wall. */
export const WIDTH_MIN = 0
export const THINNEST_WALL = 0.02
export const WIDTH_MAX = 1
export const WIDTH_STEP = 0.01
export const WIDTH_STEP_BIG = 0.05

/** Openings can be a slot or a garage door; nothing narrower than a hand or wider than a wall in practice. */
export const OPENING_MIN = 0.1
export const OPENING_MAX = 6

/** The width one step away: a centimetre, five under Shift, held within the limits and on whole centimetres; a wall stepped below the thinnest becomes an edge, and an edge stepped up the thinnest wall. */
export function stepWidth(width: number, direction: 1 | -1, big: boolean, limits: [number, number] = [WIDTH_MIN, WIDTH_MAX]): number {
  const step = big ? WIDTH_STEP_BIG : WIDTH_STEP
  const next = Math.round((width + direction * step) * 100) / 100
  const edgeGap = limits[0] === 0 && next > 0 && next < THINNEST_WALL ? (direction < 0 ? 0 : THINNEST_WALL) : next
  return Math.min(limits[1], Math.max(limits[0], edgeGap))
}

export const stepOpeningWidth = (width: number, direction: 1 | -1, big: boolean): number => stepWidth(width, direction, big, [OPENING_MIN, OPENING_MAX])

export const metres = (d: number): string => `${d.toFixed(2)} m`
/** A width as a hand reads it; a wall of no width is an edge. */
export const centimetres = (w: number): string => (w === 0 ? 'Edge' : `${Math.round(w * 100)} cm`)
