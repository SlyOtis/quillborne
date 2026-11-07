import { createLevel, type Binding, type Level, type MapDocument } from '$lib/nimap'

export interface LevelsControl {
  levels: { id: string; name: string }[]
  current: string
  switchTo(id: string): void
  add(): void
  rename(id: string, name: string): void
  remove(id: string): void
}

export const orderedLevels = (document: MapDocument): Level[] => [...document.levels].sort((a, b) => a.ordinal - b.ordinal)

export function addLevel(document: MapDocument): { document: MapDocument; level: Level } {
  const top = Math.max(-1, ...document.levels.map(l => l.ordinal))
  const level = createLevel({ name: String(document.levels.length + 1), ordinal: top + 1 })
  return { document: { ...document, levels: [...document.levels, level] }, level }
}

export const renameLevel = (document: MapDocument, id: string, name: string): MapDocument => ({ ...document, levels: document.levels.map(l => (l.id === id ? { ...l, name } : l)) })

export function removeLevel(document: MapDocument, bindings: Binding[], id: string): { document: MapDocument; bindings: Binding[] } {
  const level = document.levels.find(l => l.id === id)
  if (!level || document.levels.length < 2) return { document, bindings }
  const gone = new Set([...level.units.map(u => u.id), ...level.fixtures.map(f => f.id), ...(level.spaces ?? []).map(s => s.id)])
  return {
    document: { ...document, levels: document.levels.filter(l => l.id !== id) },
    bindings: bindings.filter(b => !b.features.every(f => gone.has(f)))
  }
}

export function withLevel(document: MapDocument, edited: Level): MapDocument {
  return { ...document, levels: document.levels.map(l => (l.id === edited.id ? { ...edited, name: l.name, ordinal: l.ordinal, elevation: l.elevation } : l)) }
}
