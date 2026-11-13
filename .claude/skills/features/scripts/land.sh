#!/bin/bash
set -euo pipefail

slug=${1:?slug}

main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
cd "$main"
name="$(basename "$main")"
tree="$(dirname "$main")/$name-$slug"

if [ ! -d "$tree" ]; then
    echo "tree: $tree is not here"
    exit 2
fi
branch="$(git -C "$tree" rev-parse --abbrev-ref HEAD)"

git fetch -q origin main
if [ -n "$(git -C "$tree" status --porcelain)" ]; then
    echo "tree: $tree has uncommitted changes"
    exit 3
fi
if ! git merge-base --is-ancestor "$branch" origin/main; then
    echo "branch: $branch is not merged into origin/main"
    exit 4
fi

for pid in $(pgrep -fx 'just dev' || true); do
    if [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$tree" ]; then
        kill -INT -"$(ps -o pgid= -p "$pid" | tr -d ' ')" || true
        echo "dev: stopped the run in $tree"
    fi
done
docker rm -f "$name-$slug-db" "$name-$slug-blob" > /dev/null 2>&1 || true
docker volume rm "$name-$slug-db-data" > /dev/null 2>&1 || true
docker image rm "$name-$slug-db" > /dev/null 2>&1 || true

git worktree remove "$tree"
git branch -d "$branch"
git push -q origin --delete "$branch" 2> /dev/null || true
echo "landed: $branch, $tree removed"

git checkout -q main && git pull -q --ff-only origin main
echo "main: $(git log --oneline -1)"
