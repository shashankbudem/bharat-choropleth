# Publishing the packages

This repository ships three independently versioned libraries. They must be validated and released separately:

| Package | Directory | Registry | Command |
| --- | --- | --- | --- |
| React | `packages/react` | npm | `npm publish` |
| Plain JavaScript | `packages/js` | npm | `npm publish` |
| Flutter | `packages/flutter` | pub.dev | `dart pub publish` |

No package is public yet. Do not add a release tag, package-registry link, or a versioned CDN URL to the README until the matching registry confirms publication.

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

## After publishing

1. Confirm the exact published versions on npm and pub.dev.
2. Update the root README’s availability section from “pending” to the verified package links and add the released versions.
3. Tag the matching source commit, create GitHub release notes, and record user-facing changes in each package changelog.
4. Keep the next release version ahead of the published one; registries do not allow reusing a published version.

For registry-specific requirements, use the official [npm publishing guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) and [Dart/pub publishing guide](https://dart.dev/tools/pub/publishing).
