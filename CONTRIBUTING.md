# Contributing

Thanks for improving Bharat Choropleth. Please open an issue before substantial API or data changes so maintainers can assess compatibility, licensing, and boundary provenance.

## Before opening a pull request

- Keep renderer changes independent from boundary-data changes where practical.
- Add tests for new interaction, data-joining, formatting, or accessibility behaviour.
- Run the workspace build, type check, lint, and test commands.
- Update the README and relevant docs when public behaviour changes.
- Do not contribute boundary files without a source URL, license, vintage, attribution text, transformation record, and checksum.

## Code that exists in more than one package

The renderers are published independently and none depends on another, so some
logic is shared by copying rather than by extracting a package — which would put
a workspace dependency into the published graph of both. Editing one copy alone
is the easiest mistake to make here, so tests fail when the copies disagree.

- **`packages/react/src/` and `packages/js/src/`** share `states.ts`,
  `data-source.ts`, `geometry.ts`, `legend.ts`, `small-regions.ts`,
  `tooltip-position.ts` and `style.css` as **byte-identical** files. Change one,
  copy it to the other; `packages/react/test/shared-sources.test.ts` diffs them.
- **`packages/flutter/lib/src/states.dart`** is a translation of
  `packages/js/src/states.ts`. Dart cannot be diffed against TypeScript, so the
  two are held together by behaviour instead. After changing the state registry
  or its aliases, update the Dart file and run:

  ```bash
  pnpm generate:state-cases
  ```

  That regenerates `packages/js/test/state-resolution-cases.json`, which both
  `packages/js/test/state-resolution.test.ts` and
  `packages/flutter/test/state_resolution_test.dart` assert against. Skip it and
  one of them fails, naming the spelling that disagrees.

The Python renderer shares no code and matches values by feature id only; it is
not part of either arrangement.

## Running the Flutter example

Its boundary assets are generated data, so they are gitignored and a fresh clone
has none — while `example/pubspec.yaml` still declares the directory. `flutter
analyze` counts that as an issue and exits non-zero, so populate them first:

```bash
pnpm prepare:flutter-assets
```

`pnpm check:flutter` and `pnpm build:pages` already do this for you.

## Releasing

`DEFAULT_DATA_BASE_URL` pins the boundary bundle to a release tag. Bump it *in*
the release and run `pnpm verify:data-pin`, which fetches one asset per level
from the pinned tag. A tag that predates a level does not fail loudly — a missing
sub-district file means "this district has no sub-districts", so the whole level
silently disappears. See [the publishing guide](./docs/PUBLISHING.md).

## Boundary-data contributions

Geography is not neutral or timeless. State the source and administrative vintage, use stable identifiers, and explain aliases or unit changes. Do not add a dataset whose redistribution terms are unknown. Issues about names, coverage, or boundary representation should cite an authoritative source where possible and be handled respectfully.

## Commit and review expectations

Keep pull requests focused. Reviewers will check API compatibility, keyboard and screen-reader impact, render/bundle impact, and required data attribution. Never include credentials, private datasets, or personal information in a contribution.
