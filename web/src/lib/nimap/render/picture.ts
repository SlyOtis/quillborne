import { pieceLightsOf } from './presets'
import { Box3 } from 'three'
import type { Part } from '../furniture/parts'
import { chain, transformParts, translation, turning } from '../furniture/parts'
import { partsExtent } from '../furniture/mesh'
import { createRenderSession, TOWARD_VIEWER, type RenderSession } from './session'
import { createMaterials, SLATE_LOOK, type MapLook, type Materials } from './materials'
import { disposeObject, partsObject } from './furniture'

/** How far a pictured thing's front is turned aside from the viewer, so its front and one side both show. */
const ASIDE = (35 * Math.PI) / 180

const pictures = new Map<string, string>()
let painter: { session: RenderSession; materials: Map<string, Materials> } | null = null

/** Parts centred on the origin with their front, +y, turned toward the viewer and a little aside. */
function presented(parts: Part[]): Part[] {
  const { min, max } = partsExtent(parts)
  const facing = Math.atan2(TOWARD_VIEWER[1], TOWARD_VIEWER[0]) - Math.PI / 2 + ASIDE
  return transformParts(parts, chain(turning(facing), translation(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2)))
}

/**
 * A picture of parts as an image URL, `width` by `height` pixels on the
 * page: lit as a single piece is, on a clear ground, seen from the map's
 * viewing direction with the thing's front turned toward the viewer and a
 * little aside. One renderer draws every picture, and the same parts at
 * the same size are drawn once.
 */
export function partsPicture(parts: Part[], width: number, height: number, look: Partial<MapLook> = {}): string {
  const key = JSON.stringify([parts, width, height, look])
  const kept = pictures.get(key)
  if (kept) return kept
  painter ??= { session: createRenderSession(document.createElement('canvas'), { clear: true, interactive: false, lights: pieceLightsOf(SLATE_LOOK.pieceLight) }), materials: new Map() }
  const { session } = painter
  const named = JSON.stringify(look)
  const materials = painter.materials.get(named) ?? createMaterials(look)
  painter.materials.set(named, materials)
  session.setLights(pieceLightsOf(look.pieceLight ?? SLATE_LOOK.pieceLight))
  session.resize(width, height)
  const object = partsObject(presented(parts), materials)
  session.add(object)
  session.fit(new Box3().setFromObject(object), 1.08)
  session.renderer.render(session.scene, session.camera)
  const url = session.renderer.domElement.toDataURL('image/png')
  session.remove(object)
  disposeObject(object)
  pictures.set(key, url)
  return url
}
