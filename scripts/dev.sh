#!/bin/sh
set -e

DB_NAME="$(basename "$PWD")-db"

just dev-db &
DB_PID=$!
just dev-blob &
BLOB_PID=$!

WEB_PID=""
SERVER_PID=""

cleanup() {
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
    fi
    if [ -n "$WEB_PID" ]; then
        kill "$WEB_PID" 2>/dev/null || true
    fi
    if [ -n "$BLOB_PID" ]; then
        kill "$BLOB_PID" 2>/dev/null || true
    fi
    if [ -n "$DB_PID" ]; then
        kill "$DB_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

echo "Waiting for database to be ready..."
until docker logs "$DB_NAME" 2>&1 | grep -q "ready for start up"; do
    sleep 1
done
until docker logs "$DB_NAME" 2>&1 | tail -5 | grep -q "database system is ready to accept connections"; do
    sleep 1
done
echo "Database ready."

just dev-web &
WEB_PID=$!

just dev-server &
SERVER_PID=$!

echo "Waiting for the service on $SERVER_PORT..."
until curl -sf "http://localhost:$SERVER_PORT/status/health" > /dev/null 2>&1; do
    sleep 1
done
echo "Service ready."

just seed

wait $SERVER_PID
