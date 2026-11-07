/**
 * IMDF 1.0.0 unit categories. Verify against the Apple IMDF specification
 * before relying on this list for export.
 */
export const UNIT_CATEGORIES = [
  'auditorium', 'brick', 'classroom', 'column', 'concrete', 'conferenceroom', 'drywall',
  'elevator', 'escalator', 'fieldofplay', 'firstaid', 'fitnessroom', 'foodservice',
  'footbridge', 'glass', 'huddleroom', 'kitchen', 'laboratory', 'library', 'lobby',
  'lounge', 'mailroom', 'mothersroom', 'movietheater', 'movingwalkway', 'nonpublic',
  'office', 'opentobelow', 'parking', 'phoneroom', 'platform', 'privatelounge', 'ramp',
  'recreation', 'restroom', 'restroom.family', 'restroom.female', 'restroom.male',
  'restroom.transgender', 'restroom.unisex', 'road', 'room', 'serverroom', 'shower',
  'smokingarea', 'stairs', 'steps', 'storage', 'terrace', 'theater', 'unenclosedarea',
  'unspecified', 'vegetation', 'waitingroom', 'walkway', 'walkway.island', 'wood'
] as const

export type UnitCategory = (typeof UNIT_CATEGORIES)[number]

export const isUnitCategory = (value: unknown): value is UnitCategory =>
  typeof value === 'string' && (UNIT_CATEGORIES as readonly string[]).includes(value)

/**
 * What a fixture is. A drawn shape starts as a bare object, a block of its
 * outline with a height, and is classified afterwards. Each kind maps to an
 * IMDF fixture category on export. A hole is nothing: the middle of a donut
 * table, left out of the shape around it.
 */
export const FIXTURE_KINDS = ['object', 'table', 'sofa', 'cabinet', 'hole'] as const

export type FixtureKind = (typeof FIXTURE_KINDS)[number]

export const DEFAULT_FIXTURE_HEIGHT = 0.75

/** Metres from floor to ceiling on a level that does not say: a common office storey. */
export const STOREY_HEIGHT = 2.7

/** How tall a wall is: its own height, else the level's storey height. */
export const wallHeight = (wall: { height?: number }, level: { height?: number }): number => wall.height ?? level.height ?? STOREY_HEIGHT
