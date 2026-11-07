/**
 * The format versions of a map document. `FORMAT_VERSION` is what this
 * nimap writes; `READER_VERSION` is the newest it reads as meant. They are
 * one integer each, not the package's semver: they change only when what a
 * stored field means changes, never for an added field, kind or stock item,
 * which older readers skip. Every older version reaches the current one
 * through `MIGRATIONS`, one step at a time.
 *
 * 1: every record in full, rooms and fixtures with their outlines.
 * 2: only what was drawn and declared; rooms and fixtures are derived from
 *    the lines on reading and given their identity by a point inside.
 */
export const FORMAT_VERSION = 2
export const READER_VERSION = 2
