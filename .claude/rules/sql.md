---
description: How the database is laid out and migrated with smig, how a table is named, registered and commented, and which database a session may touch
paths:
  - "database/**"
  - "scripts/build-db.sh"
  - "scripts/dev-db.sh"
  - "scripts/migrate.sh"
---

# SQL and smig

The `sql` agent holds this file. What the tables mean is `data.md` The tables, who reads a row `claimius.md`, the Go model over a table `go.md` 13, and every smig command the `smig` skill.

## Names

1. A table is singular snake_case, `campaign_map`, with `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` unless it shares another row's id, as `campaign` shares its organization's (`database/base/V1.2__base_campaign.sql:1`, `:23`).
2. `sa_` is claimius's: `sa_owner_id`, `sa_created_by`, `sa_created_at`, `sa_updated_at`, `sa_deleted_at`, and `sa_parent_id` with `sa_root_id` both or neither. No column of the service takes the prefix.
3. A flag is `is_<state>`, a reference `<table>_id`, an index `idx_<table>_<columns>` (`database/base/V1.2__base_campaign.sql:44`).
4. A file is `V<version>__<slug>_<name>.sql`, the slug the step declares in `database/migrate.yml`: `V1.9__base_monster.sql`. A file is never renumbered or reordered once merged.
5. A column, a table and a function name are the user's: proposed, and written once said.

## The tree

6. `database/migrate.yml` runs four steps in order: `Claimius Schema`, pulled by git from the middleware at the pinned ref (`:12`); `Application Tables`, `base/`; `System`, `system/`; and `Debug`, `debug/`, only where `SAUTH_DEBUG_USER_ID` is set (`:39`). There is no migrations step.
7. `base/` holds each table in its final shape, one file per concern, and nothing else: no `ALTER`, `RENAME`, `DROP` or `UPDATE`. A change to a table changes the file that creates it, in place.
8. A base file replays whenever its content changes, so every statement in it is re runnable: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`.
9. A replayed `CREATE TABLE IF NOT EXISTS` does not reshape a table that exists. An edited column reaches a fresh database and never a deployed one. A new table, a new index, a function and a comment do reach it.
10. An extension is created in the step's `pre:` (`database/migrate.yml:19`), never in a file. Each file runs in one transaction, so no `CONCURRENTLY` and no `VACUUM`. No scheduling in SQL.
11. `system/` is the disciple bootstrap alone (`database/system/V1.0__system_init_disciple.sql`). `debug/` is the two debug identities and Pip's profile, local only.
12. `database/state/` is not a step. `local.ndjson` is the table a local run starts with, imported through the handlers by `just seed` (`setup.md` Local test data).

## Registration and comments

13. A table whose rows a player is given access to carries the claimius columns of rule 2, and the file that creates it ends with `SELECT claimius.upsert_table_info('public.<table>');` (`database/base/V1.2__base_campaign.sql:184`, `database/base/V1.9__base_monster.sql:42`).
14. A table no claim binds is not registered and says so in its comment, as `state_key` does (`database/base/V1.8__base_state.sql`).
15. `COMMENT ON` every table, every column and every function, and a function comment carries its argument signature (`database/base/V1.2__base_campaign.sql:12`). No `--` and no `/* */` anywhere.
16. The claimius functions the service's SQL calls are `upsert_table_info`, `delete_table_info`, `upsert_disciple_state` and `upsert_search_source`, and nothing reads a `claimius.*` table. `debug/` alone writes its identity, claims, bindings and grants directly (`database/debug/V1.0__debug_bootstrap_identity.sql`).
17. A delete is soft, `sa_deleted_at`. Never `DELETE FROM` a registered table, and never `session_replication_role`.

## Which database

18. The local database is the session's: `just build-db` removes the container and the volume and builds the image from `database/` with this checkout's files (`scripts/build-db.sh:7`), the image runs `smig upgrade` and `smig up` on first start (`database/Dockerfile:27`), `just dev-db` starts it and `just migrate <smig args>` runs smig against it. It is rebuilt freely and without asking.
19. A deployed database is the owner's. It is migrated by the deploy's migrate job, the smig binary inside the environment, which `scripts/migrate.sh` refuses to start while `SAUTH_DEBUG_USER_ID` is set (`scripts/migrate.sh:7`). A session never runs smig, `psql` or `just migrate` against it.
20. `smig lint` before a commit. `smig check` writes to the ledger and runs against the local database only. `smig test` is never run.
21. A middleware pin moves `go.mod` and the `ref` of the `Claimius Schema` step in one commit.
22. No row a player sees is seeded by SQL. It is a record in `database/state/local.ndjson`, made by the handlers on import, so every claim is made the way a player makes it.

## Good and bad

23. Good: `database/base/V1.9__base_monster.sql`, one table in its final shape, every column commented, registered on its last line.
24. Good: `database/base/V1.8__base_state.sql`, a table outside claimius that names why in its comment.
25. Bad: `ALTER TABLE campaign ADD COLUMN ...` in a base file. The column goes into the `CREATE TABLE`, rule 7, and what a deployed table then lacks is rule 28.
26. Bad: a base or system file calling `claimius.insert_claim`, `insert_claim_object` or `insert_user_claim`, or inserting into `claimius.claim`. Rule 16; a claim is made by a handler.
27. Bad: a column without its `COMMENT ON`, or a `--` line explaining it.

## Do and don't

28. Do stop and say so when a change alters or drops a column of a table that is deployed: name the table, the column and that rule 9 keeps it from the deployed database. How it reaches there is the owner's call.
29. Do rebuild the local database after a base file changes, `just build-db` then `just dev`, and read that the import still lands.
30. Do keep the Go model, the state group and `database/state/local.ndjson` moving with the table (`go.md` 13 and 15).
31. Don't add a folder under `database/` that no step names, or a step, without the user naming it.
32. Don't put logic in a seed. Don't write an access check in SQL of the service's own.
