---
description: The stack, the keys, the checkouts and their slots, the local table and the tests
paths:
  - "**"
---

## Stack

A Go service in `cmd/` and `internal/` (Echo, Bun, `samna-auth-middleware` as a disciple) owns the data and the access, and serves the Svelte app from `web/dist` on the same port. Postgres holds the table, migrated by smig through `database/migrate.yml`; live changes reach the table as server-sent events over Postgres `LISTEN` and `NOTIFY`; file originals live in blob storage behind the service, Azure Blob Storage when deployed and Azurite locally; AI calls go through the service with the calling player's own key. `data.md` carries the schema, the claims, the api, the streams, the uploads and the AI route; `cli.md` the `/api/state` groups and `qubo`.

The web lives in `web/`: `web/src` is the app, `web/public` the static sources and art, `web/test` the walk and its specs. Vite proxies `/api` to the service and nothing else.

pnpm only. Never npm, never yarn.

## Keys

Every key lives in `.env`, which is ignored. `.env.example` names every key the code reads and carries the working local value of each one that is not a secret; a secret stays empty there.

- `APP_NAME`, `SERVER_*`: the service's name, version, port, html path, allowed origins, log level, environment, and `SERVER_OWNER_ID`, the Knights of the Cauldron organization in Samna Auth that owns every row.
- `PG*`: the Postgres connection the service and smig use.
- `SAUTH_ENDPOINT`, `SAUTH_APP_SLUG`, `SAUTH_APP_SECRET`, `SAUTH_REDIRECT_URI`, `SAUTH_PAGE_REDIRECT`: the Samna Auth prophet and the app this service signs in as. A local run leaves `SAUTH_ENDPOINT` and `SAUTH_APP_SECRET` empty and reaches no hosted service: it signs in as `SAUTH_DEBUG_USER_ID`, writes claims through the local claimius functions, and keeps files in Azurite.
- `SAUTH_DEBUG_USER_ID`: set, the service signs every request in as that user and the `debug` migration step seeds the identity, so a local run needs no browser login. Empty on tst.
- `SAUTH_DEBUG_PRIVATE_SEED`: the app seed a debug run opens its Samna Auth secrets with; a deployed service fetches its seed from the prophet at start and holds it in memory only.
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`: the blob store for file originals, Azurite locally on the port the `BlobEndpoint` names, 10000 in `.env.example`. The service creates the container on start.
- `FILE_MAX_BYTES`: the largest upload the service accepts; a bigger one answers 413.
- `REPLICATE_ENDPOINT`: the Replicate API the AI routes pass calls on to.
- No GitHub token: `samna-auth-middleware`, `samna-migrate`, `nimbody` and `nimtel` are public, so the build, the image and smig pull them without one. The one private module is `sauth`, which only the deploy workflow installs, with `secrets.DOCKER_PACKAGE_READ`. A token key is never named `GITHUB_TOKEN` or `GH_TOKEN`.

The secrets are `SAUTH_APP_SECRET`, `SAUTH_DEBUG_PRIVATE_SEED`, `PGPASSWORD` and `AZURE_STORAGE_CONNECTION_STRING`; `PGPASSWORD` and `AZURE_STORAGE_CONNECTION_STRING` are secrets everywhere but locally, where the database password is its name and the blob string is Azurite's published development account, both in `.env.example`. A secret is never committed and never gets a `VITE_` prefix, because a `VITE_` value is inlined into the bundle.

A per player key, such as the Replicate key, is never a key in `.env`, locally or on tst. It is a Samna Auth secret bound to that player's own **Keys** claim, which no one else holds, and the profile records only which claim it is; it is set and removed on `/user`, and what the api answers about it is `data.md` Claims. `web/src/lib/integrations.ts` is the one list of services, what each is for and which key it uses. Add a service there before writing code that calls it.

## Several checkouts at once

Every worktree runs a local stack of its own, side by side with the others, so each one can open and test its own changes. A checkout's slot `n` sets its ports: the service on `4290 + n`, Postgres on `5490 + n`, Azurite on `10000 + n`, and Vite on `5173 + n`. `.env.example` carries slot 0; the main checkout runs on slot 2.

- The ports live in the checkout's own `.env`: `SERVER_PORT`, `PGPORT` and the port of the `BlobEndpoint`. The service reads `.env` itself and over the environment, so a port is changed there and nowhere else. Vite takes `5173 + SERVER_PORT - 4290` and holds it strictly, failing rather than moving to a port that belongs to another checkout.
- The containers, the volume and the database image are named after the checkout's folder: `<folder>-db`, `<folder>-db-data` and `<folder>-blob`. `just build-db` builds the image with this checkout's migrations and its `PGPORT`, and `just dev` and `just clean` touch only this checkout's.
- The main checkout is the latest server: slot 2, http://localhost:5175, always the newest `main`, and the only run on that address. `bash .claude/skills/run/scripts/latest.sh` brings it there and is run after every merge to `main`; what it does is the `run` skill, The latest server. A worktree never takes slot 2.
- A new worktree takes its slot when step 2 of the `run` skill writes its `.env`: the lowest from 1 that no other worktree's `.env` holds and on which nothing listens, so slot 2 is skipped while the main checkout's `.env` holds it. It keeps that `.env` until the worktree is removed.
- Stop a run by the `just dev` whose working directory is this checkout, never by the first one found.

## Local test data

`database/state/` holds the tables as `/api/state` documents: `local.ndjson`, the table a local run starts with, and `tst.ndjson`, the tst table as `qubo state export` wrote it. A document is one header line, then one record per line: `group`, the table; `key`, the name the record is known by across imports, a saved name such as `ember` or `tobrin` in the local table and the row's id in an export; `data`, the fields the handler's body takes, with `owner_id`, `dm_id`, `author_id` or `user_id` naming the player who owns the row; and `refs`, the records it points at by key, `campaign_id`, `parent_id`, `tag_id`, `asset_id`. Ids inside a json field, a crew member's `character_id`, a combatant's `character_id`, a marker's `record_id`, a page's `share_campaigns`, are keys too and are mapped on import. The debug players are `testy`, `1d0c0000-0000-4000-8000-000000000001`, the `SAUTH_DEBUG_USER_ID` every local request signs in as, and `pip`, `1d0c0000-0000-4000-8000-000000000002`; the `debug` migration step seeds both identities and Pip's profile.

`just seed-state <name>` runs `qubo state import database/state/<name>.ndjson` against the running local service, and `just dev` runs `just seed`, the local table, once the service answers. The import upserts by key in dependency order, and every record goes through the handlers of `handler.PutRoutes` in process, so every row and every claim is made the way a player makes it on tst; nothing writes the tables or claimius directly. On a local run the service signs the caller in as Testy and the import acts as each record's owner, so Pip's sheets and Pip's table come up as Pip's; on tst every row is made by the caller. A record that fails is reported with its group, its key and the handler's answer, and the import's exit code is 3.

A change that adds or alters something a player sees adds or updates its records in the same branch. A new kind of row gets one or two records, in the campaign it belongs to, and a changed body changes the records that carry it. When the DM and a player see it differently, the records show both sides, the way the Ember Road keeps one page from its players and makes one roll hidden. Keep it small: enough to show each feature once. A file's bytes travel as a blob in the document when it is exported with `--blobs`.

`test/go/state_test.go`, run by `just test`, pins `internal/qubo/state.json` to the state groups, proves an import upserts by key and that a player exports only what their claims bind. `just dev` is what proves the local table imports.

## Tests

`vitest` for the web and `go test` for the service, both run by `just test`. The rules engine and the nimap core are the tested surfaces on the web: the parser, the resolver, the bridge and the store, and the geometry, model and tools of `maps.md`. A new system or a new formula ships with a case. The web `test` script runs `web/test/nimap/tools/performance.spec.ts` alone after the rest, because it measures time.

Every route ships with a Go test of who may and who may not reach it, the way `test/go/access_test.go` proves that a player reads a campaign only once seated and a hidden roll reaches the DM alone. Every stream ships with a test of what it delivers to whom, the way `test/go/stream_test.go` proves a hidden roll never reaches a player's stream.

A file named `*.spec.ts` is a test. A fixture is `*.fixture.ts` and never carries the test suffix.
