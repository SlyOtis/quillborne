# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One table: the DM and a handful of friends. Each player clones the repo and runs their own copy with `just dev`, on a laptop at the table and between sessions, sometimes on a phone. The DM runs campaigns, encounters and the lore; players build, level and play their characters.

## Product Purpose

Quillborne is the table's character sheet and campaign book. A player builds a character from rule systems declared as JSON, plays it from the sheet (rolls, hit points, spells, rests, inventory), and the table shares a campaign: its roll log and chat, maps, lore, NPCs, ships, encounters and music. Everyone seated at a campaign is its party. Success is that nobody at the table reaches for paper or another app during a session.

## Positioning

Local-first and table-owned. There is no hosted server: every player runs the dev server, which carries the AI proxy and a media store that keeps full-size originals on the machine that made them, while Firestore holds only what the table shares. Game rules are data, never code, so a new system or homebrew is a JSON document.

## Operating Context

Used live during play, where a roll, a hit point change or a spell slot must be one click and readable at a glance across a dense sheet, and between sessions for character creation, level up, lore writing and campaign prep. Dice are thrown in 3D and land in a shared roll log. Screens range from phones to wide desktop monitors.

## Capabilities and Constraints

- Svelte 5, TypeScript, Firebase (Firestore, Auth; Storage has no billing), vitest, pnpm only.
- Rules engine under `src/lib/rules/` resolves the character from systems in `public/sources/systems/`.
- Dev-server features (the `/replicate` proxy, the `/media/` store) are absent from a hosted build.
- Layouts are relative only: fr, %, flex ratios, clamp(); no absolute pixel sizes.

## Brand Commitments

The visual world is a faithful homage to the WarCraft III (Reign of Chaos / The Frozen Throne) game menus, applied everywhere including sign-in and dialogs: carved stone and dark wood frames, riveted gold and bronze trim, beveled stone buttons that glow on hover, parchment panels, a torchlit ground. The sheet's dense data stays readable first; ornament frames it, never obscures it. (User, 2026-09-29.)

## Evidence on Hand

- Catalogue emblems as SVG under `public/sources/art/`.
- Live test data: character "Aldric Ravenshade", character "Testy", campaign "The Shadow of Blackwood".
- No raster art for frames or textures exists in the repo; none is to be fabricated as a claim.

## Product Principles

1. Play first: during a session every common action is one step from the sheet.
2. Rules are data: nothing about a game system is written into a component.
3. The table owns its data: originals stay local, only what is shared leaves the machine.
4. Readable before ornate: the homage frames the data and never competes with it.
