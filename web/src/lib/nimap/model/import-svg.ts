import { extractPathData, pathToStrokes } from '../geometry/svg-path'
import { quantize } from './document'
import type { Wall } from './types'

export interface SvgImportOptions {
  /** Metres per SVG unit. */
  scale?: number
  /** Wall width in metres applied to every stroke. */
  width?: number
  /** SVG is y-down; the document is y-up. */
  flipY?: boolean
  /** Curve flattening tolerance in SVG units. */
  tolerance?: number
  idPrefix?: string
}

/** One wall per drawing command, so a traced stroke keeps a stable identity. */
export function wallsFromSvg(svg: string, options: SvgImportOptions = {}): Wall[] {
  const { scale = 0.01, width = 0.1, flipY = true, tolerance = 0.35, idPrefix = 'w' } = options
  const walls: Wall[] = []
  for (const d of extractPathData(svg)) {
    for (const stroke of pathToStrokes(d, { tolerance })) {
      const points = stroke.points.map(p => quantize([p[0] * scale, (flipY ? -p[1] : p[1]) * scale]))
      for (let i = 1; i < points.length; i++) walls.push({ id: `${idPrefix}${walls.length + 1}`, points: [points[i - 1], points[i]], width })
    }
  }
  return walls
}
