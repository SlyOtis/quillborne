# Quillborne

The table's character sheet and campaign book. Players build and play characters from rule systems written as
JSON. The table shares campaigns: the roll log and chat, maps, lore, NPCs, ships, encounters and music. A Go service
owns the data in Postgres and serves the Svelte app in `web/`.

## Run it locally

Tell your agent:

> start local dev

The agent follows `.claude/skills/start-local-dev/SKILL.md`. It checks your tools, creates `.env` with a seed of
your own, builds the database image and starts everything with `just dev`. It asks before it installs or stops
anything. A local run needs Docker and nobody else's secrets, and signs you in as a debug user who already has
characters and two campaigns to look at, the local test data in `test/seed/`.

Everything else an agent needs is in `CLAUDE.md` and `.claude/rules/`: the tests, the gate, and how work reaches
`main`.
