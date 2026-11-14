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

The schema and the api are snake_case throughout: `user_id`, `campaign_id`, `character_ids`, `is_active`, `is_hidden`, `share_users`, `dm_claim_id`. A camelCase reader is a bug, not a variant.

`Character` nests identity under `info`. `character.info.name`, never `character.name`.

## The tables

`database/base/` holds them, one file per concern, migrated by smig through `database/migrate.yml` after the claimius schema of `samna-auth-middleware`. Every table that holds what a player owns carries the claimius columns (`sa_owner_id`, `sa_created_by`, `sa_created_at`, `sa_updated_at`, `sa_deleted_at`) and ends with `SELECT claimius.upsert_table_info('public.<table>')`, so claims can bind it. `sa_owner_id` is always the Knights of the Cauldron organization, `SERVER_OWNER_ID`. A delete is soft: it sets `sa_deleted_at`.

- `profile`: a player's name, picture, preferences and friends, and `key_claim_id`, the claim their integration keys are bound to.
- `character` and its sources: the sheet as stored data.
- `campaign`: identity, settings, and the `dm_claim_id` and `player_claim_id` of its table.
- Under a campaign by `campaign_id`: `campaign_map`, `encounter`, `chat_entry` and `song`. A `campaign_map` holds its picture, `layers` and `markers`, and an optional drawn `plan`, the nimap document of `maps.md`.
- `resource`: every kind of lore, by `kind`, with `title`, the rest of the page in `fields`, a `campaign_id` when a campaign keeps it, and sub pages through `sa_parent_id` and `sa_root_id`. `resource_update` holds the Yjs updates of live editing.
- `asset`: a file, a block document or a folder, in nimployer's model. A folder is `inode/directory` with type `folder`; a block document is `application/vnd.mar.document+json` with its body in `document`; a file's bytes sit in blob storage under `blob_url`. Folders nest through `sa_parent_id` and `sa_root_id`; the roots are a campaign's folder, slug `campaign-<campaign id>`, and a player's Personal folder, slug `user-<user id>`.
- `object_asset`: attaches an asset to any row by `object_type` and `object_id`; its `properties` override the asset's key by key. `tag` and `tag_object` tag any row the same way.
- `catalog_entry`: the shared class and race readings.
- `vehicle`: a vessel the table sails, with a `campaign_id` when a campaign sails it: its vehicle `system`, `template` and `layout` keys, the installed `components`, the `states` of each, `stats`, `rulings`, the homebrew `overlay`, the `crew`, the `revision` and its `history`, and its `crew_claim_id`.
- `monster`: a creature to fight, with no campaign: its monster `system`, `name`, `size`, `type`, `alignment` and `challenge` as columns for the list to sort and filter on, the rest of the stat block in `stats`, its lore in `description` as a block document, its portrait's asset address in `image`, and `is_public`. Its monster tags are `tag_object` rows with object type `public.monster`.
- `state_key`: the key a `/api/state` import named a row by, `group`, `key` and `object_id`, so the next import of the same key finds the row. Written by the import alone and not registered with claimius.

Every table holds application data, so nothing is aged and there is no `public.prune`. The base files carry each table in its final shape and nothing else: no `ALTER`, `RENAME`, `DROP` or `UPDATE`; a change to a table changes the file that creates it, and the deploy's `smig up` replays the drifted file, so every statement stays re runnable.

## The campaign is the story

The campaign is the one grouping at the table. Every player seated in it, every holder of its Players claim, is the party, and there is no party apart from the campaign.

Everything the party lives through is a `resource` row of one of the seven kinds, held by the campaign through `campaign_id`. A player's own lore is the same row without one. The campaign kinds the table reads:

- `sessions` is the log: a number, a title, a play date, a summary, and who was present.
- `locations` is every **Place** charted, its kind, and the map and marker that fix its position.
- `items` is every **Item**: a kind, a rarity, whether it needs attunement, its weight and worth, who holds it and where it lies.

A page written in a campaign starts shared with that campaign, so it reaches the table; its owner narrows that in Access. The kind names stay as they are; the display names are Items and Places. `CampaignRecordKind`, what a map pin stands for, is `'place' | 'character' | 'item' | 'session'`.

An NPC is a character, never a kind of its own: a `character` row in the campaign whose `metadata.tags` holds `npc`, called **NPCs** everywhere a player reads it. The DM adds one, and so does any seated player, and it is bound like every sheet at the table, so every seated player reads it. The party's sheets are the campaign's characters without the tag. A map pin stands for an NPC with `record_kind` `character`, and an encounter combatant names it by `character_id`.

Prose on a resource is a block document, stored as the JSON that `web/src/lib/blocks.ts` writes, never as loose markdown. `getDocument` reads a stored string whether it is that JSON or older markdown, so a page written before the editor still opens.

A map pin holds `record_kind` and `record_id` rather than its own prose. A place is one resource whether it is read on the map or in the list. Never duplicate a description onto a pin.

## Claims decide every read and write

There is no rule file and no readers list. Access is a claim bound to the row, granted to the players who hold it, and checked by claimius on every request: a list goes through `sdb.ObjectWhere`, one row through `MutationAccess`, and a create checks EXECUTE on the owner organization, stamps the creator's grant and binds the creator's claim to the new row. A component never filters on access; what the api answers is what the reader may see.

- The creator holds the row through their own grant. Every new row is also bound to the app's Member claim with entry only, so it exists for the organization but grants no read; a public sheet, a public monster, a profile, the catalog and a tag are bound with read. A player's Personal folder is bound with entry only, so it and every file under it belong to the player alone until they share.
- A campaign makes two claims. **Dungeon master** holds all, granted to the one who runs it. **Players** holds read and write, granted when the DM seats a player by their email; every binding names its own mask, so the table reads what is bound read and writes only what is bound write, which is a campaign's vehicles. Maps and the campaign's folder are bound DM all and Players read; only the DM draws maps.
- No claim inherits, so a binding never cascades down the asset tree. An asset is bound with a copy of its parent folder's bindings when it is created, and moves only within its own root folder.
- A chat entry is bound DM read, and Players read unless `is_hidden`, so a hidden roll reaches the DM alone. Only the author edits or deletes an entry, and the DM cannot delete a player's.
- A vehicle makes **Crew**, read and write, granted to the players whose characters are on its `crew`, the user ids read from the character rows and never from the body. A campaign's vehicle is bound DM all and Players read and write, so the whole table changes it. Whoever can write a vehicle changes every field; only the builder or the campaign DM scuttles it. A `components` change carries the `revision` it was drafted on, answers 409 when it is stale, and appends a snapshot to `history`.
- Any signed in player makes a monster. `is_public` decides its Member binding through `putPublicBinding`, the one helper a sheet uses too: entry only for homebrew, which its maker alone reads, and entry and read once public, which every player reads. Only the maker changes or deletes it, public or not.
- A sheet that joins a campaign is bound DM read and write and Players read, and loses both when it leaves. Every seated player reads every sheet at the table; the sheet page offers its controls to the owner alone and saves nothing for anyone else.
- Sharing is `share_users` and `share_campaigns` on a resource, an encounter or a song. A shared campaign binds its DM and Players claims read, and the named players get the row's own **Readers** claim, `reader_claim_id`. Every change reconciles the bindings and the grants in the same transaction. Sharing binds the DM too: a page the owner did not share is hidden from the DM.
- An asset or a folder is shared directly through the claim routes with type `asset`. A page's sharing reaches the assets attached to it: every change to `share_users` or `share_campaigns` reconciles, in the same transaction, the bindings of each asset the page's owner attached through `object_asset`, and attaching or detaching does the same. A page attaches the media its blocks name when it is saved.
- A player's integration keys are Samna Auth secrets bound to their own **Keys** claim, made the first time they save a key and held by them alone. The api answers only which keys are held; the service opens a key only to call that integration for its owner.

A claim, a binding or a grant is made only through the claim helpers in `internal/handler/share.go` and the claim routes, never by SQL against claimius.

## The api

`handler.PutRoutes` in `internal/handler/routes.go` mounts every route under `/api`, behind the Samna Auth user middleware `cmd/main.go` hands it: `/profile` with its `details`, `/character`, `/campaign` with its `map`, `encounter`, `song` and `chat`, `/resource` with its `update`, `/asset` with its `data` and `object`, `/file` with the folder tree and `move`, `/tag` with its `object`, `/ai`, `/catalog`, `/vehicle`, `/monster`, and `/claim` with `/:type/:id/claim`. Sign in, the callback, sign out and `/api/auth/me` come from the middleware and stay in `cmd/main.go`. Beside them `state.Register` in `cmd/main.go` mounts nimbody's common set: `/status`, `/mcp` serving the `qubo` resource table as tools, and `/api/state` with its export and import, behind the same user middleware. The groups in `internal/state/`, one per table, export through `sdb.ObjectWhere` and import, delete and store blobs by calling the handlers of `PutRoutes` in process; what a change to them carries is `cli.md` 5, and the tables they import are `setup.md` Local test data.

On the web the api layer is `web/src/lib/api/`, the shape nimployer and bookable use. `core.ts` holds `ApiError`, the session, `path`, `request`, `unwrap` and `getStream`. `index.ts` holds every call as a plain exported function, `getCharacter`, `postCampaignMap`, `getCampaignChatStream`, and a new read or write is one more function there, never a helper of its own. `types.ts` re-exports `generated.ts` and `generated_auth.ts`, which `just gen-types` writes with tygo from `internal/db` and the middleware's `shared` models, and narrows a jsonb field with `extends Omit<...>` where the web needs its shape. No type the Go models carry is written by hand: a model change is followed by `just gen-types`.

Function names start with `get`, `post`, `put` or `delete`, in Go and in TypeScript.

## Live events

`internal/broker` is the one event path. A write posts an event after it succeeds: the event goes at once to the streams on the same instance and through `NOTIFY` on `quillborne_event` to the others, and every instance skips the events it sent itself. An event carries a topic, a kind, an id and an op, never a row.

The streams are `/api/campaign/:id/stream`, `/api/profile/stream`, `/api/resource/:id/stream`, `/api/character/:id/stream` and `/api/vehicle/:id/stream`, and the campaign stream also carries the events of the campaign's vehicles, server-sent events with a heartbeat and a retry. Opening one needs read like the matching REST read, and every event is checked again before it is sent, so a hidden roll never reaches a player's stream and a sheet's changes reach only those who read the sheet.

A broker counts as started only once its own notify has come back through its listener, because a `LISTEN` the driver has written is not yet active on the server; an instance that answers before then would miss what another instance sends.

On the web a stream function (`getCampaignChatStream`, `getCampaignMapsStream`, `getCampaignEncountersStream`, `getCampaignSongsStream`, `getCampaignCharactersStream`, `getCampaignVehiclesStream`, `getProfileStream`, `getCharacterStream`, `getVehicleStream`, `getResourceUpdatesStream`) shares one EventSource per stream and reloads through its REST getter on connect and on every event of its kind, so what it shows always matches the api.

## Uploads

Every upload goes through `postFile` in `web/src/lib/api/index.ts` with a scope of `user`, `campaignMap`, `campaignAudio` or `campaignFile`. It checks the signed in player and the content type, and posts one multipart form to `/api/asset`: the file, its `name` and `mime_type`, and the `campaign_id` of a campaign scope. Never write a file any other way.

The service places the asset by what the form names. A `parent_id` needs write on that folder. A `campaign_id` needs read on the campaign, as a seated player's upload always has, and lands in the campaign's folder. Neither lands in the player's Personal folder, made on their first upload. The blob key is the folder chain, slug or name per folder, and the asset id: `campaign-<id>/<asset id>`. The service sets `size_bytes` and `etag`, the SHA-256 of the original or of the stored document, whenever bytes are stored, so `etag` is the version: it changes when the bytes change. `POST /api/asset/:id` replaces the bytes and needs write on the asset.

`/api/asset/:id/data` carries the original from blob storage, or the document. An upload is refused with 413 past `FILE_MAX_BYTES`, by its length and while its body is read. A get or head needs read on the asset, answers 404 to anyone without it, and answers with the `ETag`, a 304 for a matching `If-None-Match`, a 206 for a single or a suffix byte range and a 416 past the end, so audio and video stream. Every player reads the original; there is no downscaled copy. A delete needs write, is soft, and removes the blob.

An attachment through `/api/asset/:id/object` needs read on the asset and write on the row it attaches to.

An address held on a row is a hosted URL, an `/api/asset/<id>/data` address, or a `file:` or `local:` reference left by an older upload. `getFileUrl` answers an asset address as it is and resolves the older references to nothing. Render it with `StoredImage`, never a bare `<img src>`, and remember its scoped CSS needs `:global(img)`.

## AI

`/api/ai/*` is the one way to Replicate. It opens the calling player's Replicate key, passes the call on to `REPLICATE_ENDPOINT` with it, and streams the answer back; without a key it answers 412. `ai.ts`, `chat.ts` and the transcription in `Chat.svelte` call it and never carry a key.

## Sign in

The app has no sign in form of its own. A guarded route in `App.svelte` sends a visitor without a session straight to Samna Auth at `/api/auth/login` through `redirectToLogin`, `/login` and `/signup` lead to `/main`, and signing out goes through `/api/auth/logout`. GitHub is the one provider bound to the app, open to any GitHub account, on Knights of the Cauldron. A local run signs in as `SAUTH_DEBUG_USER_ID` with no browser login.
