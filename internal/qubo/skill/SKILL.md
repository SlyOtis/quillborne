---
name: qubo
description: Operate Quillborne from the terminal with the qubo cli. Use when reading or writing profiles, campaigns and their players, maps, encounters, songs and chat, character sheets, vehicles, lore pages, files and folders, tags, the catalog or claims, when exporting or importing the table's data through /api/state, or when checking what a login or a credential pair can reach on a Quillborne server.
---

# qubo

`qubo` drives the Quillborne api. After `qubo login` it acts as the signed in player; otherwise it authenticates with a `samna_client` credential pair sent to the service as Basic auth, or with a token in `QUBO_TOKEN` sent as the bearer. A local run with `SAUTH_DEBUG_USER_ID` set signs every call in as that player and needs no login.

## Boundaries

1. `qubo` reaches `/api`, the one surface the web app uses too. Every command is a route of `handler.PutRoutes`; nothing exists in the cli that the api does not have.

2. Claims decide every read and write. A 403, a 404 or an empty list means the player's claims do not bind the row, not that the tool is wrong. The dungeon master holds a campaign and everything in it; a seated player reads what the table shares.

3. `qubo state export` and `qubo state import` move the table's data as one ndjson document: profiles, tags, the catalog, campaigns with their players, characters, vehicles, maps, encounters, songs, chat, lore pages, assets with their bytes, attachments and tag bindings. An import runs every record through the same handlers as the api, so every row and every claim is made the way a player would make it.

## Configuration

Values resolve flags first, then the process environment, then the dotenv files named with `--env`, then a local `.qubo/config.yaml` found by walking up from the working directory, then the named config in `~/.qubo/config.yaml`, picked by `--config`, `QUBO_CONFIG`, the local `use:` and then `default:`. The config keys are `endpoint`, `app_slug`, `client_id` and `client_secret`; a secret in the local file is refused, since that directory is committed, and a secret is never a flag.

1. `QUBO_ENDPOINT` or flag `--endpoint`. The Quillborne base url without a path, for example `http://localhost:4290`.

2. `QUBO_APP_SLUG` or flag `--app`. The Samna Auth app the client belongs to, sent as `SAuth-App-Slug`.

3. `QUBO_CLIENT_ID` or flag `--client-id`. The `client_id` uuid of a machine client.

4. `QUBO_CLIENT_SECRET`, from the environment, an `--env` file or the home config only.

5. `QUBO_TOKEN`, from the environment only. A bearer used as it is, ahead of a login and a client pair.

`qubo login` signs in through the service's own login in the browser, as the player does on the web: a PKCE verifier, a loopback listener on `127.0.0.1`, `/api/auth/login` with the challenge, and the code exchanged at `/api/auth/cli/token`. `--no-browser` prints the address instead. The session lives in the OS keychain with its metadata in `~/.qubo/<host>.cred`, is refreshed before it expires, and `qubo logout` revokes it through `/api/auth/cli/revoke`.

Always run `qubo status` first when the target is uncertain. It prints the endpoint, the app slug, the identity in use under `auth`, the `/api/auth/me` identity for a login or a token, and the health from `/status/health/readiness`. `qubo version` prints `{version, server}`.

## Commands

Every resource command is `qubo <resource> <verb> [id...] [--data '{...}' | --file body.json | --set key=value]`, and a child is `qubo <resource> <child> <verb> <parent id> [id]`. `--json` prints json on a terminal too, `--raw` the whole envelope, `--fields`, `--sort`, `--jq` and `--limit` shape a listing, and `--query key=value` adds a query parameter.

1. `profile get [user_id]`, `profile create`, `profile replace`, `profile list --query email=...`, `profile stream`; `profile details get|replace`; `profile friend create|delete`.

2. `character get [id]`, `create`, `replace <id>`, `delete <id>`, `played <id>`, `stream <id>`; `character sources get|replace <character_id>`.

3. `vehicle get [id]`, `create`, `replace <id>`, `delete <id>`, `stream <id>`. A `components` change carries the `revision` it was drafted on and answers 409 when stale.

4. `campaign get [id]`, `create`, `replace <id>`, `delete <id>`, `stream <id>`; `campaign player create <campaign_id>` with `{email}`, `campaign player delete <campaign_id> <user_id>`; `campaign character get|create|delete <campaign_id> [character_id]`; `campaign map|encounter|song|chat get|create|replace|delete <campaign_id> [id]`.

5. `resource get [id] --query kind=items --query campaign_id=...`, `create`, `replace <id>`, `delete <id>`, `stream <id>`; `resource update get|create|replace|delete <resource_id>`. A page body is its columns, `kind`, `name`, `description`, `campaign_id`, `parent_id`, `share_users`, `share_campaigns`, and every other key lands in `fields`.

6. `asset get [id]`, `asset create --upload picture.png --set name=... --set mime_type=image/png [--set campaign_id=...]` or a json body for a folder or a block document, `replace <id>`, `delete <id>`, `data <id>`, `upload <id> --upload file`, `move`; `asset object get|create|replace|delete`; `file get [id]`.

7. `tag get [id]`, `create`, `replace <id>`, `delete <id>`; `tag object create <tag_id>`, `tag object delete <tag_id> --query object_type=... --query object_id=...`.

8. `catalog get <kind> [slug]`, `catalog replace <kind> <slug>`.

9. `search get --query q=...` or `search search` with a body.

10. `claim get <id>`, `claim create`; `claim user create|delete`; `claim object get <type> <id>`, `claim object create|delete`.

11. `api <method> <path>` reaches any other route with the same identity.

## State

1. `qubo state` prints the schema: every group, its fields, its refs and what it depends on.

2. `qubo state export > table.ndjson` writes everything the identity reaches, `--group campaign --group character` a subset, `--blobs` with the bytes of every file inline, `--store` kept as an asset on the server instead of downloaded.

3. `qubo state import table.ndjson` upserts every record by its key: a record seen before is updated, a new one created, in dependency order. `--dry-run` lists every outcome and writes nothing; `--mode sync` also deletes what the targets reach and the file lacks.

4. On a local run the import acts as each record's owner, `dm_id`, `owner_id`, `author_id` or `user_id`, so a table exported from tst comes up with its players intact; on a deployed server every row is made by the caller.

5. `database/state/<name>.ndjson` is the table a local run starts with: `just seed-state <name>` imports it against the running local service.

## Plugin and mcp

`qubo plugin install` installs the Claude Code plugin: this skill and an mcp server exposing every resource command as a tool, `qubo plugin status` reads clean afterwards, and `qubo skill install` installs the skill alone. `qubo mcp` serves the tools on stdio; with a login it relays to the service's own `/mcp`.

## Exit codes

`0` success, `1` failure, `2` rejected by the server (4xx), `3` refused by a protected config, `4` no credential, `130` interrupted. A pipe always gets json.
