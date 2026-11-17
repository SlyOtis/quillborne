---
description: The Postgres schema, the claims that decide who reads what, the api the client reaches it through, live events and uploads
paths:
  - "database/**"
  - "internal/**"
  - "cmd/**"
  - "web/src/lib/api/**"
  - "tygo.yaml"
  - "web/src/lib/collab.ts"
  - "web/src/lib/ai.ts"
---

## Casing

The schema and the api are snake_case throughout. A camelCase reader is a bug, not a variant. `Character` nests identity under `info`: `character.info.name`, never `character.name`.

## The tables

`database/base/` holds them, one file per concern, in their final shape; `sql.md` says how a table is written and registered. Every table that holds what a player owns carries the claimius columns, so claims can bind it, and a delete is soft.

- Who owns a row, and which campaign it belongs to, is its `sa_owner_id` and nothing else: the campaign's organization for what a table keeps, Knights of the Cauldron for a player's own. `claimius.md` 1 to 7.
- `profile` is the player. `character` is the sheet as stored data. `campaign` is what a table of play holds beside its organization, one row with the organization's id.
- A campaign keeps maps, encounters, chat and songs. A map holds its picture, its layers and markers, and an optional drawn plan, the nimap document of `maps.md`.
- `resource` is every kind of lore, by `kind`, with the rest of the page in `fields` and sub pages through the claimius parent and root. `resource_update` holds the updates of live editing.
- `asset` is a file, a block document or a folder, in nimployer's model: folders nest through the claimius parent and root, bytes sit in blob storage, and `object_asset` attaches an asset to any row by object type and id. `tag` and `tag_object` tag any row the same way.
- `vehicle` is a vessel with its system, components, states, crew and revision history. `monster` is a creature with its stat block. `catalog_entry` is the shared class and race readings.
- `state_key` remembers the key an import named a row by. It is written by the import alone and is not registered with claimius.

Every table holds application data, so nothing is aged.

## The campaign is the story

The campaign is the one grouping at the table. Every player seated in it is the party, and there is no party apart from the campaign.

- Everything the party lives through is a `resource` of one of the kinds, owned by the campaign. A player's own lore is the same row owned outside one.
- An item row is homebrew: whatever a player makes. The general items are the world's list and no row at all: documents under `web/public/sources/items/` every player reads and nobody writes.
- A page written in a campaign starts shared with it; an item written in a campaign starts kept from it and reaches the table locked. Its owner widens or narrows that in Access.
- An NPC is a character carrying the `npc` tag, never a kind of its own, and is bound like every sheet at the table.
- Prose is a block document, never loose markdown.
- A map pin points at a record by kind and id and never carries prose of its own.

## A campaign is an organization

A campaign is a claimius organization of kind `campaign` under Knights of the Cauldron, made through the builder the way nimployer makes a team. The organization holds the name and the description; the `campaign` row shares its id. The api answers the two as one campaign, with its dungeon master and its players read from the holders of the claims bound on the organization.

- Everything a table keeps is owned by its organization and made with the campaign's writer; what a player keeps for themselves is made with no owner named and stays under Knights of the Cauldron, theirs alone until they share it.
- A row that joins or leaves a campaign changes owner with it.
- The Owner claim and the Player claim are bound on the organization with the member bit, and neither inherits: holding the organization opens no row in it. Every row is bound by itself.
- A new kind of campaign row carries the claimius columns and no column naming its campaign, is made with the campaign's writer, bound to the Owner and the Player claim with the masks it should have, soft deleted when the campaign closes, and given its state group.

## The page tree

Pages nest through the claimius parent and root. Each campaign and each player has one root row, made the first time a page needs it. A root is never a page: it is left out of every list and export. A top level page is a child of its root. A move inside one root is a parent change; a move to another root goes through `migrate_root`.

## Claims decide every read and write

There is no rule file and no readers list. Access is a claim bound to the row, granted to the players who hold it, and checked by claimius on every request. A component never filters on access; what the api answers is what the reader may see.

- The creator holds the row through their own grant. Every new row is also bound to the app's Member claim with entry only, so it exists for the organization but grants no read; what every player reads is bound with read.
- A campaign makes two claims when it is created. **Owner** is granted to the one who runs it, the dungeon master. **Player** is the default claim of every seated player. Every binding names its own mask, so the table reads what is bound read and writes only what is bound write.
- No claim inherits, so a binding never cascades. A row made under another copies that row's bindings when it is created.
- What only some may see is a binding left out: a hidden roll is not bound to the Player claim, so it reaches the dungeon master alone.
- A row with a crew or readers of its own makes its own claim for them, granted to the players it names, read from the rows and never from the body.
- Public or not is one binding: entry only for what its maker alone reads, entry and read once public.
- A locked item is open to whoever reads it and answered as its head alone to the rest of the table that keeps it. The lock is never stored; the service derives it from the bindings.
- Sharing is `share_users` and `share_campaigns`. A shared campaign binds its Owner and Player claims read, the named players get the row's own readers claim, and every change reconciles bindings and grants in one transaction. Sharing a page reaches the assets attached to it.
- A player's integration keys are Samna Auth secrets bound to a claim they alone hold. The api answers only which keys are held.

A claim, a binding or a grant is made only through the claim helpers the handlers share and the claim routes, never by SQL against claimius.

## The api

- Every route is mounted in one route table, under one prefix, behind the Samna Auth user middleware. Sign in and the session are the middleware's.
- Beside the routes the service mounts nimbody's common set: status, the cli's resource table served as MCP tools, and the state export and import. A state group, one per table, exports through the access predicate and imports by calling the handlers in process; `cli.md`.
- Every list is filtered by query parameters, and a row's owner is filtered as `owner_id`.
- On the web the api layer is `web/src/lib/api/`: one file for the session and the request, one where every call is a plain exported function, and the types `just gen-types` writes from the Go models. A new read or write is one more function there, never a helper of its own, and no type the Go models carry is written by hand.
- Function names start with `get`, `post`, `put` or `delete`, in Go and in TypeScript.

## Live events

- `internal/broker` is the one event path. A write posts an event after it succeeds; it reaches the streams on the same instance at once and the others through Postgres, and an event carries a topic, a kind, an id and an op, never a row.
- A stream is server-sent events. Opening one needs read like the matching read, and every event is checked again before it is sent, so nothing reaches a stream its reader could not read.
- On the web every stream function shares one connection per stream and reloads through its getter on connect and on every event of its kind, so what it shows always matches the api.

## Uploads

- Every upload goes through the one upload function of the web's api layer, as one multipart form. Never write a file any other way.
- The service places the asset by what the form names: a parent folder needs write on it, an owner needs read on that campaign and lands in its folder, and neither lands in the player's Personal folder.
- The stored `etag` is the version: it changes when the bytes change. Reading the bytes needs read on the asset and supports conditional and ranged requests, so audio and video stream; an upload past `FILE_MAX_BYTES` is refused.
- An attachment needs read on the asset and write on the row it attaches to.
- An address held on a row is rendered with `StoredImage`, never a bare `<img src>`.

## AI

The service is the one way to Replicate. It opens the calling player's own key, passes the call on and streams the answer back; without a key it refuses. The web never carries a key.

## Sign in

The app has no sign in form of its own. A guarded route sends a visitor without a session straight to Samna Auth. A local run signs in as `SAUTH_DEBUG_USER_ID` with no browser login.
