#!/bin/sh
set -e

FOLDER="web/src/components/ui/glyphs"
OUT="$FOLDER/names.ts"

echo "Writing $OUT from $FOLDER..."
{
    echo "export type IconName ="
    for file in "$FOLDER"/*.svg; do
        echo "  | '$(basename "$file" .svg)'"
    done
} > "$OUT"

echo "$(ls "$FOLDER"/*.svg | wc -l | tr -d ' ') glyphs named."
