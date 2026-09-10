import type { Configuration } from 'webpack';
import { merge } from 'webpack-merge';
import ReplaceInFileWebpackPlugin from 'replace-in-file-webpack-plugin';
import path from 'path';

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
const config = async (env: Record<string, unknown>): Promise<Configuration> => {
  const base = await grafanaConfig(env as never);
  if (env.production) {
    return base;
  }

  const devVersion = `${version}-dev.${Date.now()}`;
  return merge(base, {
    plugins: [
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
