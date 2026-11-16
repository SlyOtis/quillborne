#!/bin/bash
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"
echo "fetch: origin/main"
git fetch origin main -q || { echo "fetch: origin not reached"; exit 2; }
behind="$(git rev-list --count HEAD..origin/main)"
echo "branch: $branch, $behind behind origin/main"
[ "$behind" = "0" ] && exit 0
if [ "$branch" = "main" ]; then
    git merge --ff-only origin/main -q
else
    git merge --no-edit origin/main -q || { echo "merge: conflicts in"; git diff --name-only --diff-filter=U; exit 1; }
fi
echo "head: $(git log --oneline -1)"
