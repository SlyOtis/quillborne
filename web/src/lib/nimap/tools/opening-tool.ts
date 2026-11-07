import type { Opening, OpeningKind } from '../model/types'
import { uid } from '../model/document'
import { DEFAULT_OPENING, fitOpening, sideOf } from '../model/openings'
import { selectionOf } from './selection'
import { createTool, HIT_RADIUS_PX, type OverlayItem, type ToolContext, type ToolDefinition } from './tool'

/** How far from a wall's centreline, in pixels, the hand still places on it, on top of half the widest wall. */
export const OPENING_REACH_PX = HIT_RADIUS_PX * 2

export interface OpeningToolData {
  /** Which end of the door in hand carries the hinge; Tab flips it and the choice stays for the next door. */
  hinge: 0 | 1
}

/** The reach of a hand placing or sliding an opening: half the widest wall plus a margin. */
export const openingReach = (ctx: ToolContext): number => OPENING_REACH_PX / ctx.scale + Math.max(0, ...ctx.level.walls.map(w => w.width)) / 2

/**
 * Where the opening in hand would land: on the nearest wall in reach, nudged
 * to the nearest legal stretch; a door swings to the side the hand is on.
 * Null when no wall is in reach or the opening fits nowhere on it.
 */
export function pendingOpening(kind: OpeningKind, hinge: 0 | 1, ctx: ToolContext): Opening | null {
  const p = ctx.inputs.point
  if (!p) return null
  const width = ctx.settings.openingWidth[kind]
  const band = DEFAULT_OPENING[kind]
  const fit = fitOpening(p, { id: 'pending', width, from: band.from, to: band.to }, ctx.level.walls, ctx.level.openings, openingReach(ctx))
  if (!fit) return null
  const swing = kind === 'door' ? { side: sideOf(p, fit.host), hinge } : undefined
  return { id: 'pending', kind, at: fit.at, width, from: band.from, to: band.to, ...(swing ? { swing } : {}) }
}

/**
 * Places doors or windows: the opening in hand follows the pointer along
 * whichever wall is nearest, already nudged out of junctions and other
 * openings, so what is shown is what a click places. Tab flips the hinge
 * of the door in hand; the side follows the hand. The tool stays active
 * after a placement.
 */
export function openingToolDefinition(kind: OpeningKind): ToolDefinition<OpeningToolData> {
  return {
    id: `${kind}-tool`,
    initial: 'idle',
    create: () => ({ hinge: 0 }),
    sources: [],
    states: {
      idle: {
        pointerDown: (_event, data, ctx) => {
          const pending = pendingOpening(kind, data.hinge, ctx)
          if (!pending) return
          const opening: Opening = { ...pending, id: uid() }
          return { commands: [{ type: 'addOpening', opening }], commit: `Place ${kind}`, selection: selectionOf([], [], [], [opening.id]) }
        },
        key: (event, data) => {
          if (event.key === 'Tab') data.hinge = data.hinge === 0 ? 1 : 0
        }
      }
    },
    overlay: (_state, data, ctx): OverlayItem[] => {
      const pending = pendingOpening(kind, data.hinge, ctx)
      return pending ? [{ type: 'opening', opening: pending }] : []
    },
    cursor: () => (kind === 'door' ? 'arrow-door' : 'arrow-window')
  }
}

export const doorToolDefinition = openingToolDefinition('door')
export const windowToolDefinition = openingToolDefinition('window')

export const createDoorTool = () => createTool(doorToolDefinition)
export const createWindowTool = () => createTool(windowToolDefinition)
