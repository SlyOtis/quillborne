#!/bin/bash
set -euo pipefail

main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
cd "$main"
name="$(basename "$main")"
slot=2
service=$((4290 + slot)); db=$((5490 + slot)); blob=$((10000 + slot)); vite=$((5173 + slot))
log="/tmp/$name-dev.log"
export PATH="$PATH:$(go env GOPATH)/bin"

echo "main: fetching origin/main"
git fetch -q origin main
if [ "$(git branch --show-current)" != "main" ]; then
    git checkout -q main
fi
git pull -q --ff-only origin main
echo "main: $(git log --oneline -1)"

echo "env: slot $slot, service $service, postgres $db, azurite $blob, vite $vite"
[ -f .env ] || cp .env.example .env
grep -q '^SAUTH_DEBUG_PRIVATE_SEED=$' .env && sed -i '' "s/^SAUTH_DEBUG_PRIVATE_SEED=$/SAUTH_DEBUG_PRIVATE_SEED=$(openssl rand -hex 32)/" .env
sed -i '' -e "s/^SERVER_PORT=.*/SERVER_PORT=$service/" -e "s/^PGPORT=.*/PGPORT=$db/" \
    -e "s|\(BlobEndpoint=http://127.0.0.1:\)[0-9]*/|\1$blob/|" .env
just env > /dev/null

echo "stop: this checkout's run and whatever holds its ports"
for pid in $(pgrep -fx 'just dev' || true); do
    if [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$main" ]; then
        kill -INT -"$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null || true
    fi
done
sleep 2
for port in $service $db $blob $vite; do
    for pid in $(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true); do
        case "$(ps -o comm= -p "$pid")" in
            *OrbStack*|*docker*|*com.docker*) ;;
            *) kill "$pid" 2>/dev/null || true ;;
        esac
    done
done
for c in $(docker ps -a --format '{{.Names}}\t{{.Ports}}' | awk -v p=":$db->|:$blob->" '$0 ~ p {print $1}'); do
    docker rm -f "$c" > /dev/null
    echo "stop: removed container $c"
done
docker rm -f "$name-db" "$name-blob" > /dev/null 2>&1 || true
sleep 1
for port in $service $db $blob $vite; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN -t > /dev/null 2>&1; then
        echo "stop: port $port is still held by $(lsof -nP -iTCP:"$port" -sTCP:LISTEN | awk 'NR==2{print $1, $2}')"
        exit 3
    fi
done

echo "web: dependencies and dist"
[ -d web/node_modules ] || (cd web && pnpm install > /dev/null)
[ -f web/dist/index.html ] || just build-web > /dev/null

built="$(docker image inspect -f '{{.Created}}' "$name-db" 2>/dev/null || echo 1970-01-01T00:00:00Z)"
changed="$(git log -1 --format=%cI -- database)"
baked="$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$name-db" 2>/dev/null | sed -n 's/^PGPORT=//p' || true)"
if [ "$built" \< "$changed" ] || [ "$baked" != "$db" ]; then
    echo "db: building the image"
    just build-db > /dev/null
fi

echo "start: just dev, log $log"
perl -MPOSIX -e 'setsid or die "setsid: $!"; exec @ARGV' just dev > "$log" 2>&1 &
for i in $(seq 120); do
    curl -sf "http://localhost:$vite/api/auth/me" > /dev/null 2>&1 && grep -q '^upsert:' "$log" && break
    sleep 1
done
if ! curl -sf "http://localhost:$vite/api/auth/me" > /dev/null 2>&1; then
    echo "start: not answering on $vite after 120s, see $log"
    exit 4
fi
echo "seed: $(grep '^upsert:' "$log" | tail -1)"
echo "serving: http://localhost:$vite, $(git log --oneline -1)"
