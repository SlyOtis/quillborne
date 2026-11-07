import { SLATE_LOOK, type MapLook } from '$lib/nimap/render'
import type { CursorColours } from './cursors'

export const getToken = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function getLook(): MapLook {
  return {
    background: getToken('--ground'),
    floor: getToken('--ground-raised'),
    walls: getToken('--metal'),
    rooms: getToken('--ground-lift'),
    furniture: getToken('--metal-bright'),
    accent: getToken('--ember'),
    light: SLATE_LOOK.light,
    pieceLight: SLATE_LOOK.pieceLight
  }
}

export const getCursorColours = (): CursorColours => ({ fill: getToken('--ink'), line: getToken('--ground-deep') })

export const CANVAS = {
  background: 'var(--ground-deep)',
  grid: 'var(--ground-lift)',
  wall: 'var(--stone)',
  wallEdge: 'var(--stone-light)',
  edge: 'var(--ink-faint)',
  open: 'var(--ink-faint)',
  junction: 'color-mix(in srgb, var(--stone) 88%, var(--ink))',
  wallSelected: 'color-mix(in srgb, var(--stone) 60%, var(--verdigris))',
  wallHover: 'color-mix(in srgb, var(--stone) 85%, var(--ink))',
  centerline: 'var(--ink-dim)',
  node: 'var(--ink)',
  nodeStroke: 'var(--ground-deep)',
  nodeSelected: 'var(--ember)',
  nodeOutline: 'var(--ink)',
  hover: 'var(--verdigris)',
  selected: 'var(--verdigris)',
  preview: 'var(--ember)',
  box: 'var(--verdigris)',
  unit: 'var(--verdigris)',
  unitHidden: 'var(--ground)',
  unitSelected: 'var(--verdigris)',
  label: 'var(--ink)',
  readout: 'var(--ember-core)',
  calibration: 'var(--ember)',
  anchor: 'var(--ember)',
  fixture: 'var(--metal-dim)',
  fixtureStroke: 'var(--metal)',
  fixtureSelected: 'var(--metal-bright)',
  opening: 'var(--metal)',
  openingSelected: 'var(--ember-core)'
} as const

export const GUIDES: Record<string, string> = {
  alignment: 'var(--verdigris)',
  angle: 'var(--metal-bright)',
  parallel: 'var(--ink-dim)',
  perpendicular: 'var(--ember)',
  edge: 'var(--ember-core)'
}

export const SNAP_NODE = 'var(--ink)'
