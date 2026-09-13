import { readFileSync } from 'fs';
import { join } from 'path';
import { vendorStyles } from './vendorStyles';

/**
 * The same file scripts/sync-vendor-styles.mjs copies from.
 *
 * Built as a path rather than resolved: jest maps every `.css` specifier to
 * identity-obj-proxy, so `require.resolve('bharat-choropleth/style.css')` hands
 * back that mock and this test would compare the stylesheet against a stub.
 */
function installedCss(): string {
  return readFileSync(join(__dirname, '..', 'node_modules', 'bharat-choropleth', 'dist', 'style.css'), 'utf8');
}

/**
 * `vendorStyles.ts` is a copy of the renderer's stylesheet, and copies drift.
 *
 * Nothing else would notice: a dependency bump that changes the CSS leaves this
 * file behind, the panel keeps rendering with the previous release's styles, and
 * the only symptom is that a fix made in the package never reaches the plugin.
 */
describe('vendorStyles', () => {
  it('matches the stylesheet of the installed renderer', () => {
    expect(vendorStyles).toBe(installedCss());
  });

  it('holds the stylesheet exactly as the generator writes it', () => {
    const onDisk = readFileSync(`${__dirname}/vendorStyles.ts`, 'utf8');
    expect(onDisk).toContain(`export const vendorStyles = ${JSON.stringify(installedCss())};`);
  });

  // The whole point of holding it as a string: nested in emotion it is scoped to
  // the panel, where importing the same file would style the entire page.
  it('carries the map rules it is supposed to scope', () => {
    expect(vendorStyles).toContain('.india-choropleth');
    expect(vendorStyles.length).toBeGreaterThan(1000);
  });
});
