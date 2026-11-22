---
description: How a character is defined, layered and calculated, and how a component reaches the result
paths:
  - "web/src/lib/rules/**"
  - "web/public/sources/systems/**"
  - "web/src/components/character_sheet/**"
---

## The spec

A rule system is a JSON document under `web/public/sources/systems/`. It declares `attributes`, `proficiencyTiers`, `skills`, `saves`, `senses`, `speeds`, `pools`, `derived`, `progression`, `panels` and `items`. `web/src/lib/rules/spec.types.ts` is the shape.

Nothing about 5e is hard coded in a component. A character is data plus the systems it declares.

## The formula language

Every number is an expression evaluated by `web/src/lib/rules/expression.ts` against a flat scope of numbers. Arithmetic, comparisons, ternaries, and `floor`, `ceil`, `round`, `abs`, `sign`, `min`, `max`, `clamp`, `pow`. No `eval`, no code in a system file.

Scope names are `level`, `prof`, `attr.<id>`, `mod.<id>`, `skill.<id>`, `save.<id>`, `sense.<id>`, `speed.<id>`, `pool.<id>.max`, `derived.<id>`, `bonus.<id>`, `armor.<id>` and `step.<key>`. A speed with no `value` of its own is zero. A missing `bonus.`, `armor.` or `step.` name is zero, so an optional input never breaks a system.

A skill or save with no `modifier` of its own uses `mod.<attribute> + prof * tier`, where `tier` is the multiplier of the character's proficiency tier for that entry.

## Layering

`extends` names the systems a document sits on. `getMergedSystem` merges by `id`, so an overlay that redefines `armorClass` replaces it rather than adding a second one. `getSystemStack` applies a list left to right, then a character's own overlay last.

A character can therefore add an attribute, a skill or a point pool nobody else has, and `dnd5e` stays untouched for everyone else.

## Resolving

`getResolvedCharacter` builds a node per computed value and resolves each on demand, so declaration order does not matter. A loop throws `RuleCycleError` rather than hanging. An attribute is clamped to its declared range and the level to `progression.maxLevel`.

## The bridge

`web/src/lib/rules/sheet.ts` maps the stored `Character` onto the engine input. `getAttributeId` and `getSkillId` turn display titles into system ids, so a display name never reaches a formula. It resolves once to learn the modifiers, then recovers the hit point, initiative and speed bonuses from the stored totals, so nothing double counts, and takes the stored range of a sense the system gives a unit as the least that sense reaches. The stored totals leave out what worn items grant: the item layer goes on after the recovery, and the spellcasting bonus is read from the worn scores. Whatever writes a stored total, such as level up, works it out without the inventory. Armor class is never recovered: the stored `info.ac` is only what a page shows while the system loads, and the system works it out from the armor worn.

## Reaching it from a component

`CharacterPage` provides `getRulesStore(chStore)` on the `rules` context. A component reads `$rules.resolved` and takes the value from `attributes`, `skills`, `saves`, `senses`, `pools` or `derived`, falling back to the stored number while the system loads.

`RulePanels` draws every panel the bespoke layout does not. A system that adds a pool or a derived value appears on the sheet with no code change, so never author a component for one.

## Adding a system

A JSON file plus a case in `web/src/lib/rules/derive.spec.ts`. Never a branch in a component.

## Items

One item model. A weapon, a piece of armor and ammunition are items of a category, never kinds of their own. The system's `items` names every list an item reads: its `categories` (each with the `glyph` its row draws, `stats` when it is written with weapon, armor or container figures, and `consumable` when it is used up by default), the `weaponProperties` (one that `spends` names the category each attack uses up, so ammunition is a property and a category and never a title), the `weaponCategories` a weapon proficiency names, the `armorCategories` (whether Dexterity counts, its `cap`, and `shield` for one worn beside armor), and the `attack` formulas. Damage types are the system's `damageTypes`.

An item of the room and a carried item share their figures: `properties` holds a weapon's `damage`, `versatile` dice, `range`, `weapon` category and `magic` bonus, and armor's `ac` (`base`, `bonus`, `dexModifier`, `maxDexBonus`), `armor` category, `strength` and `stealth`. A weapon's properties are its tags, `tags` in the room and `attributes` when carried, read against the system's `weaponProperties`. A carried item's `type` is its category.

Armor class is a formula of the system over `armor.<id>`: `getWornArmor` puts the equipped body armor's `worn`, `base`, `dex`, `cap` and `strength` there, and the `bonus` of it and of every equipped shield. With no armor worn the formula reads `derived.unarmored`, which a class's overlay redefines the way an overlay redefines anything, so unarmored defence needs no code.

Attacks are built, never stored: `getWeaponAttacks` makes one per equipped weapon with `damage`, working out `reach`, `ability`, `hit` and `damage` from the system's `attack` against the resolved scope, each of the weapon's properties as 1 or 0, `ranged`, `proficient` and `magic`. A weapon is proficient when the character's proficiencies name its category's title, its name or its subtype. A weapon whose property `spends` a category uses up one equipped item of it per attack; a thrown or a melee weapon uses up nothing. A stored action tied to a carried weapon gives way to the built one, and a stored attack of no weapon, such as a spell, is drawn as stored.

An item's `grants` are a layer over a character, the way an overlay is a layer over a system: `ItemGrants` in `web/src/lib/rules/item.types.ts` names, per entry, the id of the item's `system` and the scope it lands on, `attr.<id>`, `bonus.<id>`, `skill.<id>`, `save.<id>` and `sense.<id>`. A system lists what a grant may name beside its attributes, skills, saves, senses, `damageTypes` and `defences`: `bonuses`, the `bonus.<id>` names its formulas read, `speeds` and `recharges`. `getItemGrants` in `web/src/lib/resources.ts` reads the grants of a general document and of a homebrew page alike, and `getGrantLines` writes them out with the system's titles.

A character carries an item as a `CharacterInventoryItem`, added from the item room through `getCarriedItem`, which keeps its `grants`, its `properties` and its `origin`, the general item's slug or the homebrew item's id. Carried is not equipped, and attuned is not equipped: `equipped` and `attunement.attuned` are two flags on the item. The system's `items` says when an item applies, `applies` read against `equipped`, `attuned` and `attunement`, and how many items may be attuned at once, `attunement` read against the resolved character. `getSheet` lays the grants of every item that applies over the sheet through `getWornSheet`: a score raised and set on `attr.`, a bonus added on `bonus.`, a proficiency at the higher tier, and the least a `sense.` or a `speed.` reaches through `reaches`. `getAttunedInventory` refuses an attunement past the slots. The sheet shows the defences an applying item grants beside the stored ones, the advantages it grants on a save and the bonuses a save formula reads under the saving throws through `getSaveNotes`, the ranged senses it reaches in the features tab, where a stored range is the least the sense reaches, the first speed the system declares in the speed slot, and its spells and charges in the spells tab.

A carried item keeps `spent`, the charges of its `grants.charges` used. Casting one of its spells from the Spells tab spends that spell's `charges` and is refused when too few are left. Charges come back by the system's `recharges`: one that names `rests` comes back on those rests, a long rest naming everything a short one does, and one without, such as dawn and dusk, is called for from the inventory; each item rolls its `regain` through the roll log. A consumable declares `properties.use`, a `roll` and an `effect` from the system's item `uses`; using it rolls through the roll log and applies the total through the engine's own healing, temporary hit point or damage path, then spends one of it when it is used up, by its `consumable` flag or else its category's.

The general items are one document each under `web/public/sources/items/`, named in its `index.json`. An equipment pack names the items it unpacks into in `pack`, and lands in an inventory as them, the rest sitting in the first that is a container (`getCarriedItems`). A class source's `startingEquipment` lists what every member gets and, for each choice, the options; a new character starts with the fixed items and the first option of each (`getStartingInventory`).

A container is an item whose `properties.capacity` holds pounds; a carried item sits in one through `inside`, the container's id, and is drawn under it. What is carried weighs each item times its `quantity`, with its coins by the system's `coinWeight` against `coins`, less whatever sits, however deep, in a container that is `weightless` (`getCarriedWeight`), and is worth each item times its `quantity` (`getInventoryValue`). The system's `coins` are the purse and what each is worth, and its `encumbrance` the loads, each past its `over` against the resolved character, the heaviest one passed being the one that holds; carry capacity is the system's `derived.carryCapacity`.

## Vehicles

A vehicle system is a JSON document under `web/public/sources/systems/vehicles/`, listed in its `index.json`. It declares the catalogue of `components` and their `categories`, the `sizes`, the deck `layouts` and their slots, the `templates` a vessel is built from, the crew `perks` and `perkTrees`, the open `rulings` with their provisional answers, the `qualities`, the `installHours`, the `text` of every condition and property, and `rules`: every threshold and penalty, and which ruling switches which rule. `web/src/lib/rules/vehicle.types.ts` is the shape.

`web/src/lib/rules/vehicle.ts` interprets it: conditions, damage and repair, top speed, changes of facing, weight, weapon modes, compatibility, perk limits, comparisons, template drift and the deck map's footprints. A component that a ruling changes names the ruling in its own entry, so no ruling id or component key is written in the engine. A vessel's `overlay` adds or replaces catalogue entries by `key`, so homebrew stays on that vessel.

A character's crew standing is `character.crew[<vehicle system id>]`, its level and perks. `getCrewman` takes the abilities and the proficiency from the resolved character, so every to hit and DC on a deck is the character the reader sails as.

A new vehicle system is a JSON file plus a case in `web/src/lib/rules/vehicle.spec.ts`.

## Monsters

A monster system is a JSON document under `web/public/sources/systems/monsters/`, listed in its `index.json`. It declares the `abilities`, the `sizes` in order with the hit die of each, the creature `types` with the glyph each draws (a type without one draws `typeGlyph`), the `alignments`, `damageTypes`, `conditions`, `senses`, `movements`, `languages` and `habitats`, the `skills` with their ability, the `challenges` with their experience and proficiency bonus, the proficiency `tiers`, the `flags` a monster may carry (legendary, mythic, a lair), the `features` sections of a stat block (traits, actions, bonus actions, reactions, legendary actions), the `defaults` a new monster starts from, the `distance` unit, the `labels` every line of a stat block is written with, and the `formulas`. `web/src/lib/rules/monster.types.ts` is the shape.

`web/src/lib/rules/monster.ts` interprets it. `getMonsterStats` reads a stored `stats` into its full shape, filling what is missing from `defaults`. `getMonsterBlock` works out every figure on the block with `expression.ts`: `modifier` against `score`, `save` and `skill` against `mod`, `prof` and `tier`, then `passivePerception`, `initiative`, `initiativeScore`, `hitPoints` and `hitBonus` against a scope of `prof`, `attr.<id>`, `mod.<id>`, `skill.<id>`, `dice` and `die`. `isMonsterShown` is every filter of the Monsters page. A list, a name or a number on the Monsters page, the Monster page or their filters comes from the system, never from the component.

A new monster system is a JSON file plus a case in `web/src/lib/rules/monster.spec.ts`.
