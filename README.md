# Quillborne

The table's character sheets and campaigns: a Go service over Postgres serving a Svelte app.

## Run it locally

```sh
cp .env.example .env
just install
just build-db
just dev
```

`.env.example` is the whole local `.env`; nothing else is needed. You are signed in as a debug player with test data
from `test/seed/`.
