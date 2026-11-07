import { describe, it, expect } from 'vitest'
import { Box3, InstancedMesh, Matrix3, Matrix4, Mesh, Vector3, type Object3D } from 'three'
import { createMaterials, partsObject } from '$lib/nimap/render'
import { blobPart, boxPart, chain, cylinderPart, determinant, partMesh, partsExtent, prismPart, scaling, tipping, transformParts, translation, turning, unitMesh } from '$lib/nimap'
import type { Part, PartMesh, Polygon, Transform } from '$lib/nimap'
import { demoFurniture } from '../fixtures/demo-building.fixture'
import { furnitureGallery } from '../fixtures/furniture-gallery.fixture'

const materials = createMaterials()

/** A mesh in the document's frame as the scene holds it: north to negative z, height to y. */
const inScene = ({ positions, normals }: PartMesh): PartMesh => {
  const flip = (a: number[]) => a.flatMap((_, i) => (i % 3 ? [] : [a[i], a[i + 2], -a[i + 1]]))
  return { positions: flip(positions), normals: flip(normals) }
}

/**
 * What an object draws, in the scene, cut into pieces of `triangles`
 * triangles each: every instance of an instanced mesh, and every stretch of
 * a merged mesh, its corners in the order drawn and each with the normal it
 * is lit by. An instance's normal is carried as three.js carries it, divided
 * by the square of each of the instance's axes and then turned by them.
 */
function drawnPieces(object: Object3D, triangles: number): PartMesh[] {
  object.updateMatrixWorld(true)
  const pieces: PartMesh[] = []
  object.traverse(o => {
    if (!(o instanceof Mesh)) return
    const position = o.geometry.getAttribute('position')
    const normal = o.geometry.getAttribute('normal')
    const worldNormal = new Matrix3().getNormalMatrix(o.matrixWorld)
    const instances = o instanceof InstancedMesh ? Array.from({ length: o.count }, (_, i) => o.getMatrixAt(i, new Matrix4())) : [null]
    for (const m of instances) {
      const drawn: PartMesh = { positions: [], normals: [] }
      for (let k = 0; k < position.count; k++) {
        const p = new Vector3().fromBufferAttribute(position, k)
        const n = new Vector3().fromBufferAttribute(normal, k)
        if (m) {
          const e = m.elements
          const axis = (c: number) => e[4 * c] ** 2 + e[4 * c + 1] ** 2 + e[4 * c + 2] ** 2
          p.applyMatrix4(m)
          n.set(n.x / axis(0), n.y / axis(1), n.z / axis(2)).applyMatrix3(new Matrix3().setFromMatrix4(m))
        }
        p.applyMatrix4(o.matrixWorld)
        n.applyMatrix3(worldNormal).normalize()
        drawn.positions.push(p.x, p.y, p.z)
        drawn.normals.push(n.x, n.y, n.z)
      }
      const size = triangles * 9
      for (let s = 0; s < drawn.positions.length; s += size) pieces.push({ positions: drawn.positions.slice(s, s + size), normals: drawn.normals.slice(s, s + size) })
    }
  })
  return pieces
}

const close = (a: number[], b: number[], within: number) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= within)

describe('parts in the scene', () => {
  const withHole: Polygon = { outer: [[0, 0], [2, 0], [2, 1.5], [0, 1.5]], holes: [[[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]]] }
  const SHAPES: [string, Part][] = [
    ['box', boxPart([0.4, 0.7, 1.1], 'furniture', [0.1, 0.2, 0.3])],
    ['smooth cylinder', cylinderPart(0.3, 0.8, 'pot', [0, 0, 0], { segments: 12 })],
    ['tapered cylinder', cylinderPart(0.14, 0.3, 'pot', [0, 0, 0], { top: 0.18, segments: 14 })],
    ['cone', cylinderPart(0.05, 0.4, 'plant', [0, 0, 0], { top: 0, segments: 3 })],
    ['prism with a hole', prismPart(withHole, 0.2, 0.5, 'tableTop')],
    ['tapered prism', { ...prismPart(withHole, 0, 0.5, 'tableTop'), shape: { type: 'prism', polygon: withHole, height: 0.5, top: 0.6 } }],
    ['blob', blobPart(0.3, 'plant', [0, 0, 1], [1, 1, 0.5], 0.4)]
  ]
  const TRANSFORMS: Transform[] = [
    translation(1, 2, 0),
    chain(translation(3, -1, 0.5), turning(0.7)),
    chain(translation(-2, 4, 0), turning(2.2), scaling(1.5, 0.5, 2)),
    chain(translation(0.2, 0, 0), turning(1), tipping(0.6), scaling(0.4, 1, 1)),
    scaling(-1, 1, 1),
    chain(translation(3, 1, 0), scaling(1, -2, 0.5), turning(1))
  ]

  it('draws every part once, corner for corner in its order, lit by the normals of its own mesh, turned, scaled, mirrored or sheared, however many repeat', () => {
    for (const [name, shape] of SHAPES) {
      const parts = [...TRANSFORMS, ...TRANSFORMS].map(t => transformParts([shape], t)[0])
      const expected = parts.map(p => inScene(partMesh(p)))
      const pieces = drawnPieces(partsObject(parts, materials), expected[0].positions.length / 9)
      expect(pieces.length, name).toBe(parts.length)
      const left = [...expected]
      for (const piece of pieces) {
        const at = left.findIndex(e => close(e.positions, piece.positions, 1e-5) && close(e.normals, piece.normals, 1e-4))
        expect(at, `${name}: a piece drawn that is no part`).toBeGreaterThanOrEqual(0)
        left.splice(at, 1)
      }
    }
  })

  it('the box round what is drawn is the box round the parts, so a view framed on them stands where it would for the parts themselves', () => {
    const parts = furnitureGallery().flatMap(e => e.parts)
    const box = new Box3().setFromObject(partsObject(parts, materials))
    const { min, max } = partsExtent(parts)
    const expected = [[min[0], max[0]], [min[2], max[2]], [-max[1], -min[1]]]
    ;(['x', 'y', 'z'] as const).forEach((axis, k) => {
      expect(box.min[axis], axis).toBeCloseTo(expected[k][0], 4)
      expect(box.max[axis], axis).toBeCloseTo(expected[k][1], 4)
    })
  })

  it('holds each mesh once per material: every one drawn more than once is one instanced mesh, and what is left is one merged mesh per material', () => {
    const parts = demoFurniture().flat()
    const repeats = new Map<PartMesh, Map<string, number>>()
    for (const part of parts) {
      if (determinant(part.transform) <= 0) continue
      const { mesh } = unitMesh(part.shape)
      const byMaterial = repeats.get(mesh) ?? repeats.set(mesh, new Map()).get(mesh)!
      byMaterial.set(part.material, (byMaterial.get(part.material) ?? 0) + 1)
    }
    const counts = [...repeats.values()].flatMap(m => [...m.values()]).filter(n => n > 1)
    const object = partsObject(parts, materials)
    const instanced = object.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh)
    const merged = object.children.filter(o => o instanceof Mesh && !(o instanceof InstancedMesh)) as Mesh[]
    expect(counts.length).toBeGreaterThan(10)
    expect(instanced.length).toBe(counts.length)
    expect(instanced.map(o => o.count).sort((a, b) => a - b)).toEqual(counts.sort((a, b) => a - b))
    expect(new Set(merged.map(m => m.material)).size).toBe(merged.length)
  })
})
