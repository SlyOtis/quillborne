#!/bin/sh
set -e

DB_NAME="$(basename "$PWD")-db"

echo "Removing existing database container and volume..."
docker rm -f "$DB_NAME" > /dev/null 2>&1 || true
docker volume rm "$DB_NAME-data" > /dev/null 2>&1 || true

echo "Building $DB_NAME image..."
docker build --build-arg APP_NAME="$APP_NAME" --build-arg PGPORT="$PGPORT" -t "$DB_NAME" ./database

echo "Database image built."
