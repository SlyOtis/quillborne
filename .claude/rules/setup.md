---
description: The stack, the keys, the environment, the commands, and what a deploy ships
paths:
  - "**"
---

## Stack

Quillborne is a hosted service that signs players in through Samna Auth. A Go service in `cmd/` and `internal/` (Echo, Bun, `samna-auth-middleware` as a disciple) owns the data and the access, and serves the Svelte app from `web/dist` on the same port. Players sign in through Samna Auth, the table's data lives in Postgres migrated by smig, claims decide who reads and writes every row, and live changes reach the table as server-sent events over Postgres `LISTEN` and `NOTIFY`.

The web lives in `web/`: `web/src` is the app, `web/public` the static sources and art, `web/test` the walk and its specs. `just dev` starts the database, the local blob store, the service on `SERVER_PORT` and the Vite dev server, and Vite proxies `/api` to the service and nothing else.

File originals live in blob storage behind the service: Azure Blob Storage when deployed, Azurite locally on the port the `BlobEndpoint` of `AZURE_STORAGE_CONNECTION_STRING` names, 10000 in `.env.example`. The service streams them with `ETag`, `If-None-Match` and byte ranges, so audio and video play from any point.

AI goes through the service. `/api/ai/*` passes a call on to `REPLICATE_ENDPOINT` with the calling player's own key and streams the answer back; the browser never holds a key and never calls Replicate itself.

pnpm only. Never npm, never yarn.

## Keys

Every key lives in `.env`, which is ignored. `.env.example` names every key the code reads and carries the working local value of each one that is not a secret; a secret stays empty there.

- `APP_NAME`, `SERVER_*`: the service's name, version, port, html path, allowed origins, log level, environment, and `SERVER_OWNER_ID`, the Knights of the Cauldron organization in Samna Auth that owns every row.
- `PG*`: the Postgres connection the service and smig use.
- `SAUTH_ENDPOINT`, `SAUTH_APP_SLUG`, `SAUTH_APP_SECRET`, `SAUTH_REDIRECT_URI`, `SAUTH_PAGE_REDIRECT`: the Samna Auth prophet and the app this service signs in as. A local run uses the same app and signs in as `SAUTH_DEBUG_USER_ID`.
- `SAUTH_DEBUG_USER_ID`: set, the service signs every request in as that user and the `debug` migration step seeds the identity, so a local run needs no browser login. Empty on tst.
- `SAUTH_DEBUG_PRIVATE_SEED`: the app seed a debug run opens its Samna Auth secrets with; a deployed service fetches its seed from the prophet at start and holds it in memory only.
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`: the blob store for file originals, Azurite locally. The service creates the container on start.
- `FILE_MAX_BYTES`: the largest upload the service accepts; a bigger one answers 413.
- `REPLICATE_ENDPOINT`: the Replicate API the AI routes pass calls on to.
- `GH_REPO_TOKEN`: reads the private `samna-auth-middleware` module and its claimius migrations in the build and in smig. Never named `GITHUB_TOKEN` or `GH_TOKEN`.

The secrets are `SAUTH_APP_SECRET`, `SAUTH_DEBUG_PRIVATE_SEED`, `PGPASSWORD`, `AZURE_STORAGE_CONNECTION_STRING`, and `GH_REPO_TOKEN`; `PGPASSWORD` and `AZURE_STORAGE_CONNECTION_STRING` are secrets everywhere but locally, where the database password is its name and the blob string is Azurite's published development account, both in `.env.example`. A secret is never committed and never gets a `VITE_` prefix, because a `VITE_` value is inlined into the bundle.

A per player key, such as the Replicate key, is a Samna Auth secret bound to that player's own **Keys** claim, which no one else holds, and the profile records only which claim it is. It is set and removed on `/user`; the API answers only whether a key is held, never its value, and only the service opens it, to call the integration for that player. `web/src/lib/integrations.ts` is the one list of services, what each is for and which key it uses. Add a service there before writing code that calls it.

## Commands

- `just install` checks every tool the recipes and scripts call for presence and version, go against the `go` line of `go.mod`, node, pnpm, jq, docker, az, playwright-cli, air, smig at the Dockerfile's pin and sauth at the deploy workflow's pin, installs each one that is missing or older than its pin, then installs the web and Go dependencies. sauth is a private nimling module and installs only with read access to it.
- `just env` fails when `.env` is missing any key `.env.example` names. `just dev`, `just build` and `just build-web` depend on it.
- `just dev-db` builds and runs the local Postgres and migrates it, and `just dev-blob` runs Azurite. `just dev` runs both together with the service and the web, and stops them with it; `just dev-server` and `just dev-web` run one each.
- `just seed` runs the local test data of `test/seed/` into the local database. `just dev` runs it once the database is migrated and before the service starts, so every local run starts with it.
- `just migrate <args>` runs smig against `database/migrate.yml` on the local database only. No recipe reaches a deployed database; the image's migrate target is what a deploy runs.
- `just gate` runs check, test, build and vet: svelte-check, vitest, `go test ./...`, the web and server builds, and `go vet`. Zero errors and zero warnings; a new warning is a regression.
- There is no deploy recipe. A merge to `main` runs `.github/workflows/azure-deploy.yml`: the image, the migrate job, the login and redirect pages, and the container app, all tagged with the first twelve characters of the commit, which is also the version the service reports. Every build, local ones included, stamps that same commit.
- `just build-docker` builds the image: the web, the server and the migrate target.

Never hand roll a step the justfile owns.

## Several checkouts at once

Every worktree runs a local stack of its own, side by side with the others, so each one can open and test its own changes. A checkout's slot `n` sets its ports: the service on `4290 + n`, Postgres on `5490 + n`, Azurite on `10000 + n`, and Vite on `5173 + n`. The main checkout is slot 0, the values of `.env.example`.

- The ports live in the checkout's own `.env`: `SERVER_PORT`, `PGPORT` and the port of the `BlobEndpoint`. The service reads `.env` itself and over the environment, so a port is changed there and nowhere else. Vite takes `5173 + SERVER_PORT - 4290` and holds it strictly, failing rather than moving to a port that belongs to another checkout.
- The containers, the volume and the database image are named after the checkout's folder: `<folder>-db`, `<folder>-db-data` and `<folder>-blob`. `just build-db` builds the image with this checkout's migrations and its `PGPORT`, and `just dev` and `just clean` touch only this checkout's.
- A new worktree takes its slot when step 2 of the `run` skill writes its `.env`: the lowest from 1 that no other worktree's `.env` holds and on which nothing listens. It keeps that `.env` until the worktree is removed.
- Stop a run by the `just dev` whose working directory is this checkout, never by the first one found.

## Local test data

`test/seed/` is the table a local run starts with. `users.json` names the debug players: `testy`, the `SAUTH_DEBUG_USER_ID` every local request signs in as, and `pip`, the second player. The `debug` migration step seeds both identities and Pip's profile. Every other `*.json` there is a list of steps, run in file name order:

- `as` names the player who makes the call.
- `call` is a method and an `/api` path, the way `handler.PutRoutes` mounts it.
- `body` is the JSON it sends.
- `save` keeps the id the call answers with under a name, which a later `call` or `body` writes as `${name}`. A player's name works the same way: `${pip}`.

The steps run in process through `handler.PutRoutes` as the player they name, so every row and every claim is made by the handlers, the way it is on tst. Nothing writes the tables or claimius directly. The seed refuses to run without `SAUTH_DEBUG_USER_ID`, which is empty on tst, and nothing under `test/` reaches the image. The first step that fails stops `just dev` with its file, its number and the answer.

A change that adds or alters something a player sees adds or updates its steps in the same branch. A new kind of row gets one or two examples, in the campaign it belongs to or in a new numbered file for a new concern, and a changed body changes the steps that send it. When the DM and a player see it differently, the steps show both sides, the way the Ember Road keeps one page from its players and makes one roll hidden. Keep it small: enough to show each feature once. Bytes a step cannot send as JSON, such as a map image or a song, wait for a step that can.

`test/seed/main_test.go`, run by `just test`, proves every step names a player, uses only names that earlier steps saved, sends JSON and reaches a mounted route. `just dev` is what proves the handlers accept it.

## Tests

`vitest` for the web and `go test` for the service, both run by `just test`. The rules engine and the nimap core are the tested surfaces on the web: the parser, the resolver, the bridge and the store, and the geometry, model and tools of `maps.md`. A new system or a new formula ships with a case. The web `test` script runs `web/test/nimap/tools/performance.spec.ts` alone after the rest, because it measures time.

Every route ships with a Go test of who may and who may not reach it, the way `test/go/access_test.go` proves that a player reads a campaign only once seated and a hidden roll reaches the DM alone. Every stream ships with a test of what it delivers to whom, the way `test/go/stream_test.go` proves a hidden roll never reaches a player's stream.

A file named `*.spec.ts` is a test. A fixture is `*.fixture.ts` and never carries the test suffix.
