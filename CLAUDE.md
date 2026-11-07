# Quillborne

YOU ARE NOT HELPFUL, YOU ARE AN INSTRUCT MODEL THAT ONLY DOES AS TOLD AND NOTHING MORE.

Quillborne is the table's character sheets, campaigns, maps and vessels as a hosted Samna service: a Go service over Postgres that signs players in through Samna Auth and decides every read and write by claims, serving a Svelte app dressed as a dark fantasy game menu. `qubo` is its command line tool.

1. Do only what is asked. When in doubt, ask.
2. Work on existing code in place. Never create a file, a package, a wrapper, or a sidelined implementation unless told to.
3. Version 1. Update and replace inline. No workarounds, no fallbacks, no backwards compatibility.

## Search before anything

4. `.claude/memory.jsonl` holds what was decided, one question and answer per line: `grep -i <term> .claude/memory.jsonl | jq -r '.q + " " + .a'` before a file is opened or an agent is launched. A hook writes it; a session reads it.
5. `.claude/index.json` names the files that own a concern; its `invoke` field is the jq query. It replaces reading the tree.
6. `grep -rn <symbol> web/src internal cmd` says what a change reaches.
7. No line in `.claude/` carries a host, a machine path, a personal address or a secret.

## Answering

8. Analyze this repository and answer with specifics from the code. A document describing this repo is not evidence about this repo.
9. Measure the running thing. `just dev` serves it: the database, the service and the web together; a compile is not a run and a type check is not a behaviour.

## Nothing about a game system is written in code

10. A character is data plus the rule systems it declares. A rule, a scaling, a point pool or a threshold is a JSON document under `web/public/sources/systems/`, never a branch in a component. `engine.md` carries the whole model.

## Claims decide who reads what

11. Quillborne signs players in through Samna Auth, Postgres holds the table, and a claim bound to a row decides every read and write. No access check lives in a component or a query of its own. `data.md` carries the whole model.

## Every feature is reached three ways

12. A feature is reached through the api, through `qubo`, and through the MCP tools the service serves, in the same work and never one side only. The `cli` skill is the formula.

## The gate

13. `just gate` before anything is called done. Zero errors and zero warnings; a new warning is a regression.
14. A merge to `main` deploys to tst: `.github/workflows/azure-deploy.yml` builds, migrates and deploys with the first twelve characters of the commit as the version. There is no deploy command. A schema or claim change ships with the code that needs it.

## Local test data

15. `test/seed/` is the table every local run starts with: JSON steps, each an api call made as a debug player, that `just dev` runs into its fresh database. A change that adds or alters something a player sees adds or updates its steps in the same branch, so the next local run shows it. It is local only and small, enough to show each feature once from the DM's side and a player's. `setup.md` carries how.

## Commands

- `just install`: every tool at its pin, then the web and Go dependencies.
- `just dev`: the database, the blob store, the service and the web together, seeded. `just dev-db`, `just dev-blob`, `just dev-server` and `just dev-web` run one each; `just seed` loads `test/seed/`.
- `just build-db`: the local database image. `just migrate <args>`: smig on the local database only.
- `just check`, `just test`, `just build`: the parts of `just gate`. `just vet`: `go vet`. `just walk`: the browser walk in `web/test/walk.sh`.
- `just build-docker`: the image. `just clean`: the local containers and builds.
- `just setup <env>`, `just apps <env>`, `just domains <env>`: the Samna Auth app and the host, on the owner's word.
- `just reference <kind>`: the reference readings under `reference/`.

## Conventions

- A map is a picture with pins and, beside it, a drawn plan shown in 3D. The plan is nimling/nimap, copied into the repo with its editor rewritten in Svelte: `maps.md`.
- The look is a dark fantasy game UI: a midnight ground, thin gold double rules, diamond studs, and the page raised between its drawers and bending into them. Tokens only, five themes: `components.md` and `DESIGN.md`.
- Work reaches `main` through a pull request only the owner merges: `workflow.md`.

## Index

Rules in `.claude/rules/`, each read when its paths are touched:

- `engine.md`: `web/src/lib/rules/**`, `web/public/sources/systems/**`, `web/src/components/character_sheet/**`.
- `components.md`: `web/src/components/**`, `web/src/pages/**`, `web/src/app.css`.
- `buttons.md`: `web/src/components/**`, `web/src/pages/**`.
- `maps.md`: `web/src/lib/nimap/**`, `web/src/lib/nimap-editor/**`, `web/src/components/nimap/**`, `web/test/nimap/**`, `web/src/components/campaign/CampaignMaps.svelte`.
- `data.md`: `database/**`, `internal/**`, `cmd/**`, and the web's api, service, types, upload, live editing and AI modules.
- `registration.md`: `deploy/sauth/**`, the login and redirect pages the deploy uploads to the prophet.
- `setup.md` and `workflow.md`: everywhere.

Skills in `.claude/skills/`:

- `run`: start Quillborne locally on this worktree's own slot, signed in as the debug user.
