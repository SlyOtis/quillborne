set dotenv-load
set export

default:
    @just --list

install:
    sh scripts/install.sh

env:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -f .env ]; then
        echo ".env is missing. Copy .env.example to .env and fill in the values."
        exit 1
    fi
    missing=0
    while read -r key; do
        [ -z "$key" ] && continue
        if ! grep -qE "^${key}=" .env; then
            echo "missing in .env: $key"
            missing=1
        fi
    done < <(grep -oE '^[A-Z][A-Z0-9_]*' .env.example)
    if [ "$missing" -ne 0 ]; then exit 1; fi
    echo ".env carries every key .env.example names"

build: build-web build-server

build-web: env
    rm -rf web/dist web/node_modules/.vite
    cd web && pnpm build

build-server:
    sh scripts/build-server.sh

gen-types:
    tygo generate

build-db:
    sh scripts/build-db.sh

build-docker:
    docker build --build-arg IMAGE_VERSION="$(git rev-parse --short=12 HEAD)" -t "$APP_NAME" .

dev: env
    sh scripts/dev.sh

dev-db:
    sh scripts/dev-db.sh

dev-blob:
    sh scripts/dev-blob.sh

dev-server:
    sh scripts/dev-server.sh

dev-web:
    cd web && pnpm dev

seed:
    go run ./test/seed

preview: build-web
    cd web && pnpm preview

check:
    cd web && pnpm check

test:
    cd web && pnpm test
    go test ./...

vet:
    go vet ./...

walk:
    bash web/test/walk.sh

gate:
    just check
    just test
    just build
    just vet

migrate *args:
    smig {{args}} --schema=./database/migrate.yml --db-dir=./database

update:
    cd web && pnpm update --latest

clean:
    sh scripts/clean.sh

setup env:
    bash scripts/setup.sh {{env}}

apps env:
    bash scripts/apps.sh {{env}}

domains env:
    bash scripts/domains.sh {{env}}

reference kind *ARGS:
    bash web/scripts/reference.sh {{kind}} {{ARGS}}

