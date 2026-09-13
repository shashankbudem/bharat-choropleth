import type { Configuration } from 'webpack';
import { merge } from 'webpack-merge';
import ReplaceInFileWebpackPlugin from 'replace-in-file-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';
import fs from 'fs';

import grafanaConfig from './.config/webpack/webpack.config';
import { version } from './package.json';

/**
 * Extends the scaffolded config rather than editing it — `create-plugin update`
 * overwrites everything under `.config/`.
 *
 * The one addition is a unique version on development builds. Grafana cache-busts
 * plugin code with `?_cache=<plugin version>`, and that version comes from
 * package.json, so every rebuild during development serves the *same* URL for
 * different code and the browser keeps handing back the copy it already has. A
 * hard reload clears it, which is a trap: you change something, reload, see no
 * difference, and go looking for the bug in your code.
 *
 * Production builds keep the real semver — that is the number users see, and it
 * changes on release, which is exactly when the cache should be invalidated.
 */
/**
 * Ship the boundary data inside the plugin.
 *
 * Grafana serves a plugin's own files from /public/plugins/<id>/, so bundling
 * them means the map is same-origin: no second host to run, no CORS headers to
 * get right, and nothing fetched from a third party in a viewer's browser. It
 * also works in an air-gapped Grafana with no configuration at all.
 *
 * Only the current-2019 levels are copied — the panel never requests the
 * historical Census-2011 bundle or the claim outline, and every file copied here
 * ends up in the signed manifest.
 */
const BOUNDARY_DIRS = ['current-2019-states', 'current-2019-districts', 'current-2019-subdistricts'];
// Two layouts, one config. In this monorepo the geometry is generated at the
// root; in the standalone plugin repository it is vendored beside the source so
// a clone builds without a sibling checkout. Preferring the local copy means the
// export to that repository does not have to patch this file — a sync that
// rewrites code is a sync that eventually rewrites it wrong.
const LOCAL_DATA = path.resolve(__dirname, 'data/generated');
const DATA_SRC = fs.existsSync(LOCAL_DATA) ? LOCAL_DATA : path.resolve(__dirname, '../../data/generated');

const copyBoundaries = new CopyWebpackPlugin({
  patterns: BOUNDARY_DIRS.map((dir) => ({
    from: path.join(DATA_SRC, dir),
    to: path.resolve(__dirname, 'dist/data/generated', dir),
  })),
});

const config = async (env: Record<string, unknown>): Promise<Configuration> => {
  const base = await grafanaConfig(env as never);
  if (env.production) {
    return merge(base, { plugins: [copyBoundaries] });
  }

  const devVersion = `${version}-dev.${Date.now()}`;
  return merge(base, {
    plugins: [
      copyBoundaries,
      new ReplaceInFileWebpackPlugin([
        {
          dir: path.resolve(process.cwd(), 'dist'),
          test: [/(^|\/)plugin\.json$/],
          rules: [{ search: `"version": "${version}"`, replace: `"version": "${devVersion}"` }],
        },
      ]),
    ],
  });
};

export default config;
