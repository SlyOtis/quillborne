/**
 * What a tool means by its cursor, named for the situation rather than
 * drawn: the editor turns a name into an image. Directional cursors carry
 * their angle in degrees, clockwise on screen, quantised so the editor can
 * cache one image per angle.
 */
export type CursorName =
  | 'arrow'
  | 'arrow-add'
  | 'arrow-remove'
  | 'arrow-heal'
  | 'arrow-wall'
  | 'arrow-fixture'
  | 'arrow-door'
  | 'arrow-window'
  | 'arrow-bend'
  | 'move'
  | 'grab'
  | 'grabbing'
  | 'not-allowed'
  | `resize@${number}`
  | `rotate@${number}`
  | `flip@${number}`

const ANGLE_STEP = 5

const quantise = (deg: number): number => ((Math.round(deg / ANGLE_STEP) * ANGLE_STEP) % 360 + 360) % 360

/** A two-headed resize arrow along `deg`: 0 is horizontal, 90 vertical. */
export const resizeCursor = (deg: number): CursorName => `resize@${quantise(deg) % 180}`

/** A bent double arrow round a corner: 0 for a top-left corner, 90 top-right, 180 bottom-right, 270 bottom-left. */
export const rotateCursor = (deg: number): CursorName => `rotate@${quantise(deg)}`

/** A mirror over an axis along `deg`: the wall's own line to flip a door's side, across it to flip the hinge. */
export const flipCursor = (deg: number): CursorName => `flip@${quantise(deg) % 180}`

/** A directional cursor's kind and angle, or null for a plain one. */
export function directional(name: CursorName): { kind: 'resize' | 'rotate' | 'flip'; angle: number } | null {
  const m = /^(resize|rotate|flip)@(-?\d+)$/.exec(name)
  return m ? { kind: m[1] as 'resize' | 'rotate' | 'flip', angle: Number(m[2]) } : null
}
