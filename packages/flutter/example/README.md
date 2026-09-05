# `bharat_choropleth` example

The three-level parity demo: a country choropleth, drill-down into a state's
districts, and again into a district's sub-districts — the same map, config and
colours as the React and plain-JavaScript demos in this repository.

## Boundary assets are not committed

The example loads its boundary data through `rootBundle`, so the files must sit
inside this directory and be listed in `pubspec.yaml`. They are generated data,
not source, so `packages/flutter/.gitignore` keeps `example/assets/` out of the
repository — which means a fresh clone has an empty directory that `pubspec.yaml`
still declares.

Populate it from the workspace root before running or analyzing anything:

```bash
pnpm prepare:flutter-assets
```

`pnpm check:flutter` and `pnpm build:pages` run this for you. Run it by hand
before `flutter run`, `flutter analyze` or `flutter test` from inside this
directory.

Skipping it does not fail gently: `flutter analyze` counts the resulting
`asset_directory_does_not_exist` warning as an issue and exits non-zero, and a
build that ignores that warning produces an app whose map silently loads nothing.

The script also replaces what is already there, so an asset left over from an
older data generation cannot shadow the current bundle.

## Run it

```bash
pnpm prepare:flutter-assets     # from the workspace root
cd packages/flutter/example
flutter run -d chrome
```

## Attribution

The bundled boundaries carry their source's licence and attribution — see
[`data/ATTRIBUTION.md`](../../../data/ATTRIBUTION.md). Keep the notice with any
build you distribute.
