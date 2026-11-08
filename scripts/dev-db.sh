#!/bin/sh
set -e

DB_NAME="$(basename "$PWD")-db"

if ! docker image inspect "$DB_NAME" > /dev/null 2>&1; then
    echo "Image $DB_NAME not found. Run 'just build-db' first."
    exit 1
fi

echo "Removing existing database container and volume..."
docker rm -f "$DB_NAME" > /dev/null 2>&1 || true
docker volume rm "$DB_NAME-data" > /dev/null 2>&1 || true

echo "Creating fresh volume..."
docker volume create "$DB_NAME-data"

cleanup() {
    echo ""
    echo "Stopping $DB_NAME..."
    docker rm -f "$DB_NAME" > /dev/null 2>&1 || true
    docker volume rm "$DB_NAME-data" > /dev/null 2>&1 || true
    echo "Database stopped and volume removed."
}
trap cleanup EXIT

echo "Starting $DB_NAME on port $PGPORT..."
docker run \
    --name "$DB_NAME" \
    -p "$PGPORT":"$PGPORT" \
    -v "$DB_NAME-data":/var/lib/postgresql/data \
    -e SAUTH_APP_SLUG="$SAUTH_APP_SLUG" \
    -e SAUTH_DEBUG_USER_ID="$SAUTH_DEBUG_USER_ID" \
    "$DB_NAME"
