# Publishing the packages

This repository ships four independently versioned libraries. They must be validated and released separately:

| Package | Directory | Registry | Command |
| --- | --- | --- | --- |
| React | `packages/react` | npm | `npm publish` |
| Plain JavaScript | `packages/js` | npm | `npm publish` |
| Flutter | `packages/flutter` | pub.dev | `dart pub publish` |
| Python | `packages/python` | PyPI | `python3 -m twine upload dist/*` |

The initial `0.1.0` release is public for the React, plain-JS, and Flutter packages. The Python package is ready for its first PyPI release. Before every release, verify that the intended version is not already published and update the root README and package links only after the registry confirms it.

## Preflight

From the repository root, install the JavaScript dependencies and run the full suite:

```bash
pnpm install
pnpm check:all
```

Before publishing, confirm that every package has its own current `README.md`, `LICENSE`, version and (where applicable) `CHANGELOG.md`. Review each archive rather than assuming that root-level files will be included:

```bash
pnpm --dir packages/react exec npm pack --dry-run
pnpm --dir packages/js exec npm pack --dry-run

cd packages/flutter
dart pub publish --dry-run

cd ../python
python3 -m unittest discover -s tests -v
uv run --isolated --with build --with twine python -m build
uv run --isolated --with twine twine check dist/*
```

Never publish secrets, local `.env` files, credentials, private test data, or generated boundary data whose redistribution terms have not been reviewed. The map packages intentionally do not need to bundle boundary data; consumers must retain the attribution for any data bundle they host.

## npm: React and plain JavaScript

The npm releases are independent even if their versions start together. Publish them one at a time from their respective directories after confirming the dry-run contents:

```bash
npm login

cd packages/react
npm publish

cd ../js
npm publish
```

Use an npm account protected by two-factor authentication. For GitHub Actions releases, prefer npm trusted publishing/OIDC instead of storing a long-lived npm token. After each publish, verify the public package page and install the exact version in a clean throwaway project before advertising it.

## pub.dev: Flutter

The Flutter package is also an independent release:

```bash
cd packages/flutter
dart pub publish --dry-run
dart pub publish
```

The publish command authenticates the uploader with a Google account. Create or transfer the package to a verified publisher for a domain controlled by the project before relying on a personal uploader. A pub.dev release is effectively permanent: publish a new version to correct a problem instead of treating unpublishing as a normal rollback path.

## PyPI: Python

The Python package has no required runtime dependencies; Matplotlib is an optional extra. Build and inspect its wheel and source distribution before uploading:

```bash
cd packages/python
python3 -m unittest discover -s tests -v
uv run --isolated --with build --with twine python -m build
uv run --isolated --with twine twine check dist/*
uv run --isolated --with twine twine upload dist/*
```

Create a PyPI account and use a trusted publisher or an account-scoped upload token outside this repository. The upload action is irreversible for a given version: update `pyproject.toml` before attempting a subsequent release.

## Boundary data must ship with the tag

`packages/js` defaults `dataBaseUrl` to a jsDelivr copy of this repository's
`data/generated` **at a pinned release tag** (`DEFAULT_DATA_BASE_URL` in
`packages/js/src/data-source.ts`). The zero-config `BharatChoropleth` fetches every
level from there, so a release is only complete when the tag it points at actually
contains the generated bundles:

| Bundle | Needed for |
| --- | --- |
| `data/generated/current-2019-states/` | The initial country map |
| `data/generated/current-2019-districts/` | State drill-down |
| `data/generated/current-2019-subdistricts/` | District drill-down into sub-districts |

Before tagging, bump `DEFAULT_DATA_BASE_URL` to the tag you are about to create, and
confirm each directory is committed at that commit. A branch ref is not an
alternative: jsDelivr caches it for hours, so a data change would silently alter
every consumer's map at a time nobody chose.

A missing sub-district directory fails **silently** rather than loudly. The loader
treats a 404 as "this district has no sub-district level" — which is a real case for
three districts — so a wholly absent bundle looks exactly like every district being a
leaf: no console error, no status message, drill-down just quietly stops one level
short. Verify by fetching one file from the tag before announcing the release:

```bash
curl -sI "https://cdn.jsdelivr.net/gh/shashankbudem/bharat-choropleth@vX.Y.Z/data/generated/current-2019-subdistricts/subdistricts/in-cd-27-398.topo.json" | head -1
```

## After publishing

1. Confirm the exact published versions on npm, pub.dev, and PyPI as applicable.
2. Update the root README’s availability section with the verified package links and released versions.
3. Tag the matching source commit, create GitHub release notes, and record user-facing changes in each package changelog.
4. Keep the next release version ahead of the published one; registries do not allow reusing a published version.

For registry-specific requirements, use the official [npm publishing guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) and [Dart/pub publishing guide](https://dart.dev/tools/pub/publishing).
