import { describe, it, expect } from 'vitest'
import { STAGES, stageLayers, stageOf, stageWithTool, DEFAULT_LAYERS } from '$lib/nimap'

describe('stages', () => {
  it('every drawing stage rests in select, and every tool is offered by some stage', () => {
    for (const s of STAGES) if (s.tools.length) expect(s.tools[0]).toBe('select')
    for (const tool of ['wall-pen', 'fixture-pen', 'select', 'bend', 'door', 'window'] as const) expect(stageWithTool(tool, 'setup')?.tools).toContain(tool)
    expect(stageWithTool('select', 'furnish')?.id).toBe('furnish')
    expect(stageWithTool('door', 'furnish')?.id).toBe('trace')
  })

  it('a stage locks every layer it does not keep live on top of the user’s overrides, opens only faces where it says so and the user has not locked the layer, and never unlocks or unhides anything', () => {
    for (const s of STAGES) {
      const plain = stageLayers(s, DEFAULT_LAYERS)
      for (const layer of ['walls', 'fixtures'] as const) {
        expect(plain[layer].locked).toBe(s.layers[layer] !== 'live')
        expect(!!plain[layer].faces).toBe(s.layers[layer] === 'faces')
        expect(plain[layer].hidden).toBe(false)
      }
      const overridden = stageLayers(s, { walls: { hidden: true, locked: true }, fixtures: { hidden: false, locked: true } })
      expect(overridden.walls).toEqual({ hidden: true, locked: true })
      expect(overridden.fixtures).toEqual({ hidden: false, locked: true })
    }
    expect(stageOf('trace').layers).toEqual({ walls: 'live', fixtures: 'muted' })
    expect(stageOf('furnish').layers).toEqual({ walls: 'muted', fixtures: 'live' })
  })
})
