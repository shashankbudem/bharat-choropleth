#!/usr/bin/env bash
# Refresh the vendored boundary geometry from the source repository.
#
# The geometry is generated in shashankbudem/bharat-choropleth and vendored here
# so this repository builds on its own — a plugin that cannot build without a
# sibling checkout is not much use to anyone reviewing or forking it. That makes
# this directory a copy, and copies drift, so this script is the only supported
# way to update it.
#
#   ./scripts/sync-geometry.sh ../bharat-choropleth
set -euo pipefail
SOURCE="${1:-../bharat-choropleth}"
SRC="$SOURCE/data/generated"
[ -d "$SRC" ] || { echo "No geometry at $SRC — pass the path to a bharat-choropleth checkout." >&2; exit 1; }
for level in current-2019-states current-2019-districts current-2019-subdistricts; do
  [ -d "$SRC/$level" ] || { echo "Missing $level in $SRC" >&2; exit 1; }
  rm -rf "data/generated/$level"
  cp -R "$SRC/$level" "data/generated/$level"
  echo "synced $level"
done
echo "Done. Rebuild with: npm run build"
