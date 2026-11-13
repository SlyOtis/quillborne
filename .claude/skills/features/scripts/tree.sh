#!/bin/bash
set -euo pipefail

number=${1:?task number}
slug=${2:?slug}
kind=${3:-feat}

main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
cd "$main"
name="$(basename "$main")"
tree="$(dirname "$main")/$name-$slug"
branch="$kind/$number-$slug"
task="$main/.claude/tasks/features/$number-$slug.md"

if [ -d "$tree" ]; then
    echo "tree: $tree exists"
    exit 2
fi

git fetch -q origin main
if git show-ref --verify --quiet "refs/heads/$branch"; then
    git worktree add -q "$tree" "$branch"
elif git ls-remote --exit-code --heads origin "$branch" > /dev/null 2>&1; then
    git worktree add -q --track -b "$branch" "$tree" "origin/$branch"
else
    git worktree add -q -b "$branch" "$tree" origin/main
fi
echo "tree: $tree on $branch"

if cmp -s "$main/web/pnpm-lock.yaml" "$tree/web/pnpm-lock.yaml" && [ -d "$main/web/node_modules" ]; then
    ln -s "$main/web/node_modules" "$tree/web/node_modules"
    echo "web/node_modules: linked to $main"
else
    (cd "$tree/web" && pnpm install --frozen-lockfile > /dev/null)
    echo "web/node_modules: installed"
fi

cp "$main/.env.example" "$tree/.env"
taken="$(git worktree list --porcelain | sed -n 's/^worktree //p' | while read -r d; do sed -n 's/^SERVER_PORT=//p' "$d/.env" 2>/dev/null; done)"
n=1
while printf '%s\n' "$taken" | grep -qx "$((4290 + n))" ||
    lsof -nP -iTCP:$((4290 + n)) -iTCP:$((5490 + n)) -iTCP:$((10000 + n)) -iTCP:$((5173 + n)) -sTCP:LISTEN -t 2> /dev/null | grep -q .; do
    n=$((n + 1))
done
sed -i '' -e "s/^SERVER_PORT=.*/SERVER_PORT=$((4290 + n))/" -e "s/^PGPORT=.*/PGPORT=$((5490 + n))/" \
    -e "s|\(BlobEndpoint=http://127.0.0.1:\)10000/|\1$((10000 + n))/|" "$tree/.env"
seed="$(sed -n 's/^SAUTH_DEBUG_PRIVATE_SEED=//p' "$main/.env" 2>/dev/null)"
sed -i '' "s/^SAUTH_DEBUG_PRIVATE_SEED=$/SAUTH_DEBUG_PRIVATE_SEED=${seed:-$(openssl rand -hex 32)}/" "$tree/.env"
echo "slot: $n, service $((4290 + n)), postgres $((5490 + n)), azurite $((10000 + n)), vite $((5173 + n))"

(cd "$tree" && just build-db > /dev/null 2>&1 && echo "database image: $name-$slug-db") || echo "database image: just build-db failed in $tree"

if [ -f "$task" ]; then
    sed -i '' -e "s/^state: .*/state: building/" -e "s|^tree: .*|tree: $tree|" "$task"
    echo "task $number: building"
fi
echo "$tree"
