#!/usr/bin/env bash
#
# Build the standalone Grafana panel repository from this one.
#
# shashankbudem/shashankbudem-bharatchoropleth-panel exists because the Grafana
# catalog wants a plugin it can review and build on its own, and because a
# reviewer should not need a monorepo checkout to compile the thing they are
# reviewing. It is a publishing mirror, not a fork: this repository is the source
# of truth, and anything committed only over there is lost the next time this
# runs.
#
# The mirror is a transform rather than a subtree, which is why `git subtree
# push` cannot express it:
#
#   - the boundary geometry lives at the repository root here and is vendored
#     beside the plugin there, so a clone builds with no network and no sibling;
#   - `.standalone/` supplies the files that only make sense over there — its own
#     README, and the script that refreshes the vendored geometry;
#   - `.standalone/exclude.txt` drops what should not be published.
#
# Deliberately, the transform never rewrites source. `webpack.config.ts` reads
# whichever geometry layout it finds, so both repositories build from the same
# file. A sync that patches code is a sync that eventually patches it wrong.
#
#   ./scripts/export-standalone-panel.sh <destination>
#
# The destination is overwritten, not merged: it is a mirror, so it should end up
# byte-identical to what this script produces regardless of what was there.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$ROOT/plugins/shashankbudem-bharatchoropleth-panel"
DEST="${1:?usage: export-standalone-panel.sh <destination>}"
LEVELS=(current-2019-states current-2019-districts current-2019-subdistricts)

[ -d "$PLUGIN/.standalone" ] || { echo "No overlay at $PLUGIN/.standalone" >&2; exit 1; }
mkdir -p "$DEST"

# Everything tracked in the plugin directory, minus what the exclude list drops.
# --delete so a file removed here is removed there; the .git directory is
# protected because the destination is usually a checkout being updated in place.
rsync -a --delete --exclude-from="$PLUGIN/.standalone/exclude.txt" \
  --filter='protect .git/***' \
  "$PLUGIN"/ "$DEST"/

# The overlay wins over anything of the same name.
rsync -a --exclude exclude.txt "$PLUGIN/.standalone"/ "$DEST"/

# The geometry, vendored. Without this the plugin builds but ships no boundaries,
# which looks like a working plugin until someone opens a map.
mkdir -p "$DEST/data/generated"
for level in "${LEVELS[@]}"; do
  [ -d "$ROOT/data/generated/$level" ] || { echo "Missing $level — run the data pipeline first." >&2; exit 1; }
  rm -rf "${DEST:?}/data/generated/$level"
  cp -R "$ROOT/data/generated/$level" "$DEST/data/generated/$level"
done

# A mirror that silently ships no map is the failure worth guarding against.
count=$(find "$DEST/data/generated" -name '*.topo.json' | wc -l | tr -d ' ')
[ "$count" -gt 700 ] || { echo "Only $count topologies exported — expected the full set." >&2; exit 1; }

echo "Exported to $DEST ($count topologies)"
