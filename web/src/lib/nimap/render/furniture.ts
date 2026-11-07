import { Box3, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Mesh, Vector3, type Object3D } from 'three'
import type { Part, PartMaterial, Transform } from '../furniture/parts'
import { compose, determinant } from '../furniture/parts'
import { partMesh, partVertices, unitMesh, type PartMesh } from '../furniture/mesh'
import { inScene } from './geometry'
import type { Materials } from './materials'

/** How far from square an instance's axes may be, relative to their lengths. */
const SQUARE = 1e-9

/** Whether a transform only turns, scales along its own axes and moves, with no mirror and no shear: the transforms an instance is lit right under. */
function turnsAndScales(t: Transform): boolean {
  const dot = (i: number, j: number) => t[i] * t[j] + t[i + 1] * t[j + 1] + t[i + 2] * t[j + 2]
  const square = (i: number, j: number) => Math.abs(dot(i, j)) <= SQUARE * Math.sqrt(dot(i, i) * dot(j, j))
  return determinant(t) > 0 && square(0, 3) && square(0, 6) && square(3, 6)
}

function geometryOf({ positions, normals }: PartMesh): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  return geometry
}

/**
 * The box round every corner of parts, in the document's frame. three.js
 * boxes an instanced mesh by boxing each instance's box again, which for a
 * turned piece is larger than the piece, and a view framed on it would
 * stand farther off than on the same parts merged.
 */
function boundsOf(parts: Part[]): Box3 {
  const box = new Box3()
  const at = new Vector3()
  for (const part of parts) for (const [x, y, z] of partVertices(part)) box.expandByPoint(at.set(x, y, z))
  return box
}

/** A transform as an instance's matrix, column by column. */
const matrixOf = (t: Transform): number[] => [t[0], t[1], t[2], 0, t[3], t[4], t[5], 0, t[6], t[7], t[8], 0, t[9], t[10], t[11], 1]

/**
 * Parts as meshes in the document's frame, turned into the scene by the
 * same flip as the rest of the level. The parts drawn from one unit mesh in
 * one material are one instanced mesh, each part an instance its transform
 * sizes, turns and places, so a mesh is held once however often it is
 * drawn. A part that repeats nothing, as a traced table's top, and a part
 * mirrored or sheared, which an instance would light wrong, are merged
 * into one mesh per material.
 */
export function partsObject(parts: Part[], materials: Materials, shadows = true): Group {
  const repeated = new Map<PartMesh, Map<PartMaterial, { part: Part; t: Transform }[]>>()
  const merged = new Map<PartMaterial, Part[]>()
  const merge = (part: Part) => {
    const list = merged.get(part.material)
    if (list) list.push(part)
    else merged.set(part.material, [part])
  }
  for (const part of parts) {
    const { mesh, size } = unitMesh(part.shape)
    const t = compose(part.transform, size)
    if (!turnsAndScales(t)) {
      merge(part)
      continue
    }
    let byMaterial = repeated.get(mesh)
    if (!byMaterial) repeated.set(mesh, (byMaterial = new Map()))
    const list = byMaterial.get(part.material)
    if (list) list.push({ part, t })
    else byMaterial.set(part.material, [{ part, t }])
  }

  const group = inScene(new Group())
  const add = (mesh: Mesh) => {
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    group.add(mesh)
  }
  for (const [mesh, byMaterial] of repeated) {
    for (const [material, instances] of byMaterial) {
      if (instances.length === 1) {
        merge(instances[0].part)
        continue
      }
      const instanced = new InstancedMesh(geometryOf(mesh), materials[material], instances.length)
      instances.forEach(({ t }, i) => instanced.instanceMatrix.array.set(matrixOf(t), i * 16))
      instanced.boundingBox = boundsOf(instances.map(i => i.part))
      add(instanced)
    }
  }
  for (const [material, list] of merged) {
    const all: PartMesh = { positions: [], normals: [] }
    for (const part of list) {
      const { positions, normals } = partMesh(part)
      for (let i = 0; i < positions.length; i++) {
        all.positions.push(positions[i])
        all.normals.push(normals[i])
      }
    }
    add(new Mesh(geometryOf(all), materials[material]))
  }
  return group
}

/** Frees what an object built here holds on the GPU: every mesh's geometry and an instanced mesh's instances. Materials belong to the level or the host and are freed with them. */
export function disposeObject(object: Object3D): void {
  object.traverse(o => {
    if (o instanceof Mesh) o.geometry.dispose()
    if (o instanceof InstancedMesh) o.dispose()
  })
}
