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

12. A feature is reached through the api, through `qubo`, and through the MCP tools the service serves, in the same work and never one side only. The `cli` skill is the formula and `cli.md` is what a change here must carry: a route in `handler.PutRoutes`, its verb in `internal/qubo/resources.go`, which the service also serves as its MCP tools, and its `/api/state` group in `internal/state/`.

## The gate

13. `just gate` before anything is called done. Zero errors and zero warnings; a new warning is a regression. Done is merged: you merge your own pull request without asking, `workflow.md` 11.
14. A merge to `main` deploys to tst: `.github/workflows/azure-deploy.yml` builds, migrates and deploys with the first twelve characters of the commit as the version. There is no deploy command. A schema or claim change ships with the code that needs it.

## Local test data

15. `database/state/local.ndjson` is the table every local run starts with: a `/api/state` document, one record per line with its key, its data and its refs by key, that `just dev` imports through `qubo state import` once the service is up, so every row and every claim is made by the handlers. A change that adds or alters something a player sees adds or updates its records in the same branch, so the next local run shows it. It is small, enough to show each feature once from the DM's side and a player's. `database/state/tst.ndjson` is the tst table, exported with `qubo state export`. `setup.md` carries how.

## Commands

- `just install`: every tool at its pin, nimon included, then the web and Go dependencies, the `qubo` cli and the `qubo` and `nimon` skills under `.claude/skills/`.
- `just dev`: the database, the blob store, the service and the web together, then the local table imported. `just dev-db`, `just dev-blob`, `just dev-server` and `just dev-web` run one each; `just seed` imports `database/state/local.ndjson`, `just seed-state <name>` any file under `database/state/`.
- `just build-cli`, `just install-cli`, `just install-cli-completion`, `just install-cli-skill`: the `qubo` cli, its completion and its skill. `just qubo <args>` runs it from source.
- `just build-db`: the local database image. `just migrate <args>`: smig on the local database only.
- `just check`, `just test`, `just build`: the parts of `just gate`. `just vet`: `go vet`. `just walk`: the browser walk in `web/test/walk.sh`; a page that has to be seen is driven with the `nimon` skill.
- `just build-docker`: the image. `just clean`: the local containers and builds.
- `just setup <env>`, `just apps <env>`, `just domains <env>`: the Samna Auth app and the host, on the owner's word.
- `just reference <kind>`: the reference readings under `reference/`.

## Conventions

- A map is a picture with pins and, beside it, a drawn plan shown in 3D. The plan is nimling/nimap, copied into the repo with its editor rewritten in Svelte: `maps.md`.
- The look is a dark fantasy game UI: a midnight ground, thin gold double rules, diamond studs, and the page raised between its drawers and bending into them. Tokens only, five themes: `components.md` and `DESIGN.md`.
- Work reaches `main` through one pull request per feature branch, cut from its worktree and merged the moment the feature works, the next starting from a freshly pulled `main`: `workflow.md` 11 and the `features` skill.

## Index

Rules in `.claude/rules/`, each read when its paths are touched:

- `engine.md`: `web/src/lib/rules/**`, `web/public/sources/systems/**`, `web/src/components/character_sheet/**`.
- `components.md`: `web/src/components/**`, `web/src/pages/**`, `web/src/app.css`.
- `buttons.md`: `web/src/components/**`, `web/src/pages/**`.
- `maps.md`: `web/src/lib/nimap/**`, `web/src/lib/nimap-editor/**`, `web/src/components/nimap/**`, `web/test/nimap/**`, `web/src/components/campaign/CampaignMaps.svelte`.
- `data.md`: `database/**`, `internal/**`, `cmd/**`, and the web's api, service, types, upload, live editing and AI modules.
- `cli.md`: `internal/qubo/**`, `internal/state/**`, `cmd/qubo/**`, `test/go/state_test.go`.
- `registration.md`: `deploy/sauth/**`, the login and redirect pages the deploy uploads to the prophet.
- `setup.md` and `workflow.md`: everywhere.

Skills in `.claude/skills/`:

- `run`: start Quillborne locally on this worktree's own slot, signed in as the debug user.
- `features`: take features in as they arrive, one local task under `.claude/tasks/features/`, one worktree and one agent each, verify on the main checkout and merge each the moment it works. No GitHub issue is made for a task.
- `qubo`: the cli, its state export and import and its mcp tools; installed by `just install-cli-skill`.
- `nimon` and `nimon-pr`: drive the browser through a page or a pull request and record it; installed by `just install`.
- `git` and `github`: the git cli and everything that talks to GitHub.
- `impeccable`: the frontend design skill with its four agents under `.claude/agents/`; its launcher fetches the platform binary on first use, so the binary is never committed.
