---
description: What a change to the qubo cli, the state groups or the MCP tools must carry
paths:
  - "internal/qubo/**"
  - "internal/state/**"
  - "cmd/qubo/**"
  - "test/go/state_test.go"
---

# The qubo cli

The cli is built to the `cli` skill in `~/.claude/skills/cli`. This file is what a change here must carry.

1. Source: `internal/qubo`. Entry: `cmd/qubo/main.go`. The command table: `internal/qubo/resources.go`, a `cli.Table` of `cli.Resource` and `cli.Verb` turned into commands by nimbody's `cli.Root` and `cli.Client`, and served as the service's MCP tools by `state.Register` in `cmd/main.go`. Build and install with `just build-cli` and `just install-cli`, the skill with `just install-cli-skill`; the tests are `just test`, the state ones in `test/go/state_test.go`.
2. A new or changed command updates, in the same commit:
   2.1. its Short, usage and one example;
   2.2. its MCP annotation (`mcp: read|write|destructive`) or the reason it is not a tool;
   2.3. the bundled skill `internal/qubo/skill/SKILL.md` where the change is something a caller must know;
   2.4. the test that pins its flags, json output and exit code.
3. Output, exit codes, config, credentials and the MCP server come from nimbody. A change to any of them is made there, released, and pinned here; never patched locally.
4. Release: a merge to `main` deploys the service with the cli built from the same commit; `qubo plugin status` reads clean after `just install-cli-skill`.
5. A new or changed resource on `/api` updates, in the same change, its `/api/state` group in `internal/state/`: the group's schema, its refs and what it depends on, its export through `sdb.ObjectWhere` and its import, delete and blobs through the handlers of `handler.PutRoutes`, so every row and every claim an import makes is made by the handler. `internal/qubo/state.json` is rewritten by `TestTheEmbeddedStateDocumentIsTheDefinitions` and committed with the change.
6. Check: `~/.claude/skills/cli/scripts/audit.sh qubo` passes before the merge.
