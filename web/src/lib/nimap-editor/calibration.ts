import { distance, type Reference, type Vec2 } from '$lib/nimap'

export const DEFAULT_METRES_PER_PIXEL = 0.01

export function referenceExtent(reference: Reference): { width: number; height: number } {
  return { width: reference.widthPx * reference.metresPerPixel, height: reference.heightPx * reference.metresPerPixel }
}

export const referenceOrigin = (reference: Reference): Vec2 => reference.origin ?? [0, 0]

export function imagePixelToDocument(reference: Reference, pixel: Vec2): Vec2 {
  const [x, y] = referenceOrigin(reference)
  return [x + pixel[0] * reference.metresPerPixel, y - pixel[1] * reference.metresPerPixel]
}

export function documentToImagePixel(reference: Reference, point: Vec2): Vec2 {
  const [x, y] = referenceOrigin(reference)
  return [(point[0] - x) / reference.metresPerPixel, (y - point[1]) / reference.metresPerPixel]
}

export function alignReference(reference: Reference, imageA: Vec2, imageB: Vec2, drawingA: Vec2, drawingB: Vec2): Reference {
  const [pa, pb] = [documentToImagePixel(reference, imageA), documentToImagePixel(reference, imageB)]
  const pixels = distance(pa, pb)
  if (!(pixels > 1e-9)) throw new Error('The two points on the image must be apart.')
  const metresPerPixel = distance(drawingA, drawingB) / pixels
  if (!(metresPerPixel > 0)) throw new Error('The two points on the drawing must be apart.')
  const pixel: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
  const target: Vec2 = [(drawingA[0] + drawingB[0]) / 2, (drawingA[1] + drawingB[1]) / 2]
  return { ...reference, metresPerPixel, origin: [target[0] - pixel[0] * metresPerPixel, target[1] + pixel[1] * metresPerPixel], calibrated: true }
}

export function calibratedScale(reference: Reference, a: Vec2, b: Vec2, metres: number): number {
  const measured = distance(a, b)
  if (!(measured > 1e-9)) throw new Error('Calibration points must be apart.')
  if (!(metres > 0)) throw new Error('Calibration distance must be positive.')
  return (reference.metresPerPixel * metres) / measured
}

export function createReference(init: { url: string; widthPx: number; heightPx: number; metresPerPixel?: number; opacity?: number }): Reference {
  return {
    url: init.url,
    widthPx: init.widthPx,
    heightPx: init.heightPx,
    metresPerPixel: init.metresPerPixel ?? DEFAULT_METRES_PER_PIXEL,
    opacity: init.opacity ?? 0.6,
    calibrated: false
  }
}
