---
description: How a character is defined, layered and calculated, and how a component reaches the result
paths:
  - "web/src/lib/rules/**"
  - "web/public/sources/systems/**"
  - "web/src/components/character_sheet/**"
---

## The spec

A rule system is a JSON document under `web/public/sources/systems/`. It declares `attributes`, `proficiencyTiers`, `skills`, `saves`, `senses`, `pools`, `derived`, `progression` and `panels`. `web/src/lib/rules/spec.types.ts` is the shape.

Nothing about 5e is hard coded in a component. A character is data plus the systems it declares.

## The formula language

Every number is an expression evaluated by `web/src/lib/rules/expression.ts` against a flat scope of numbers. Arithmetic, comparisons, ternaries, and `floor`, `ceil`, `round`, `abs`, `sign`, `min`, `max`, `clamp`, `pow`. No `eval`, no code in a system file.

Scope names are `level`, `prof`, `attr.<id>`, `mod.<id>`, `skill.<id>`, `save.<id>`, `sense.<id>`, `pool.<id>.max`, `derived.<id>`, `bonus.<id>` and `step.<key>`. A missing `bonus.` or `step.` name is zero, so an optional input never breaks a system.

A skill or save with no `modifier` of its own uses `mod.<attribute> + prof * tier`, where `tier` is the multiplier of the character's proficiency tier for that entry.

## Layering

`extends` names the systems a document sits on. `getMergedSystem` merges by `id`, so an overlay that redefines `armorClass` replaces it rather than adding a second one. `getSystemStack` applies a list left to right, then a character's own overlay last.

A character can therefore add an attribute, a skill or a point pool nobody else has, and `dnd5e` stays untouched for everyone else.

## Resolving

`getResolvedCharacter` builds a node per computed value and resolves each on demand, so declaration order does not matter. A loop throws `RuleCycleError` rather than hanging. An attribute is clamped to its declared range and the level to `progression.maxLevel`.

## The bridge

`web/src/lib/rules/sheet.ts` maps the stored `Character` onto the engine input. `getAttributeId` and `getSkillId` turn display titles into system ids, so a display name never reaches a formula. It resolves once to learn the modifiers, then recovers the armour, hit point, initiative and speed bonuses from the stored totals, so nothing double counts.

## Reaching it from a component

`CharacterPage` provides `getRulesStore(chStore)` on the `rules` context. A component reads `$rules.resolved` and takes the value from `attributes`, `skills`, `saves`, `senses`, `pools` or `derived`, falling back to the stored number while the system loads.

`RulePanels` draws every panel the bespoke layout does not. A system that adds a pool or a derived value appears on the sheet with no code change, so never author a component for one.

## Adding a system

A JSON file plus a case in `web/src/lib/rules/derive.spec.ts`. Never a branch in a component.

## Vehicles

A vehicle system is a JSON document under `web/public/sources/systems/vehicles/`, listed in its `index.json`. It declares the catalogue of `components` and their `categories`, the `sizes`, the deck `layouts` and their slots, the `templates` a vessel is built from, the crew `perks` and `perkTrees`, the open `rulings` with their provisional answers, the `qualities`, the `installHours`, the `text` of every condition and property, and `rules`: every threshold and penalty, and which ruling switches which rule. `web/src/lib/rules/vehicle.types.ts` is the shape.

`web/src/lib/rules/vehicle.ts` interprets it: conditions, damage and repair, top speed, changes of facing, weight, weapon modes, compatibility, perk limits, comparisons, template drift and the deck map's footprints. A component that a ruling changes names the ruling in its own entry, so no ruling id or component key is written in the engine. A vessel's `overlay` adds or replaces catalogue entries by `key`, so homebrew stays on that vessel.

A character's crew standing is `character.crew[<vehicle system id>]`, its level and perks. `getCrewman` takes the abilities and the proficiency from the resolved character, so every to hit and DC on a deck is the character the reader sails as.

A new vehicle system is a JSON file plus a case in `web/src/lib/rules/vehicle.spec.ts`.

## Monsters

A monster system is a JSON document under `web/public/sources/systems/monsters/`, listed in its `index.json`. It declares the `abilities`, the `sizes` in order with the hit die of each, the creature `types` with the glyph each draws (a type without one draws `typeGlyph`), the `alignments`, `damageTypes`, `conditions`, `senses`, `movements`, `languages` and `habitats`, the `skills` with their ability, the `challenges` with their experience and proficiency bonus, the proficiency `tiers`, the `flags` a monster may carry (legendary, mythic, a lair), the `features` sections of a stat block (traits, actions, bonus actions, reactions, legendary actions), the `defaults` a new monster starts from, the `distance` unit, and the `formulas`. `web/src/lib/rules/monster.types.ts` is the shape.

`web/src/lib/rules/monster.ts` interprets it. `getMonsterStats` reads a stored `stats` into its full shape, filling what is missing from `defaults`. `getMonsterBlock` works out every figure on the block with `expression.ts`: `modifier` against `score`, `save` and `skill` against `mod`, `prof` and `tier`, then `passivePerception`, `initiative`, `initiativeScore`, `hitPoints` and `hitBonus` against a scope of `prof`, `attr.<id>`, `mod.<id>`, `skill.<id>`, `dice` and `die`. `isMonsterShown` is every filter of the Monsters page. A list, a name or a number on the Monsters page, the Monster page or their filters comes from the system, never from the component.

A new monster system is a JSON file plus a case in `web/src/lib/rules/monster.spec.ts`.
