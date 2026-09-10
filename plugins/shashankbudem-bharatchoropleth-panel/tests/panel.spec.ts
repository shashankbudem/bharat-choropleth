import { test, expect } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';

/**
 * End-to-end cover for the dashboard-state coupling.
 *
 * Every case here is a bug this panel actually shipped and someone found by
 * clicking: the drill-down overwriting its own scope variable, the variable
 * surviving a return to the national map, and a refresh landing somewhere other
 * than where the URL said. None of them are reachable from a unit test — they
 * only exist once a real dashboard, a real URL and a real click are involved.
 *
 * The fixture is TestData, so the suite needs `npm run server` and nothing else.
 * Boundary geometry below state level is fetched from the CDN, so the drill-down
 * cases need network.
 */

const DASH = '/d/bharat-e2e/bharat-choropleth-e2e';
const REGION = 'path.india-choropleth__region';

async function waitForRegions(page: Page, atLeast: number) {
  await page.waitForFunction(
    ([selector, n]) => document.querySelectorAll(selector as string).length >= (n as number),
    [REGION, atLeast] as const,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(600);
}

/**
 * Wait for the map to actually be at a level.
 *
 * Region counts are the wrong signal: the drill-down is controlled by the
 * dashboard variable, so a click goes click → variable → URL → re-render, and a
 * count that the previous level already satisfied passes instantly. The
 * breadcrumb only changes once the new level is mounted.
 */
async function waitForLevel(page: Page, name: string) {
  await page.waitForFunction(
    (expected) =>
      (document.querySelector('.india-choropleth__breadcrumb')?.textContent ?? '').includes(expected as string),
    name,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(800);
}

/** Click a point proven to be inside the shape — a bounding-box centre misses a concave state. */
async function activate(page: Page, name: string) {
  // The breadcrumb changes as soon as the drill-down is set, but the level's
  // geometry is fetched on demand — so wait for the shape itself, not the label.
  await page.waitForSelector(`path.india-choropleth__region[aria-label^="${name}"]`, { timeout: 30_000 });
  const point = await page.evaluate((label) => {
    const el = document.querySelector(`path.india-choropleth__region[aria-label^="${label}"]`);
    if (!el) {
      return null;
    }
    const svg = (el as SVGPathElement).ownerSVGElement!;
    const box = (el as SVGPathElement).getBBox();
    const probe = svg.createSVGPoint();
    for (let fy = 0.35; fy < 0.95; fy += 0.03) {
      for (let fx = 0.15; fx < 0.9; fx += 0.03) {
        probe.x = box.x + box.width * fx;
        probe.y = box.y + box.height * fy;
        if ((el as SVGPathElement).isPointInFill(probe)) {
          const screen = probe.matrixTransform((el as SVGPathElement).getScreenCTM()!);
          return { x: screen.x, y: screen.y };
        }
      }
    }
    return null;
  }, name);

  expect(point, `no interior point found for ${name}`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

const varState = (page: Page) => new URL(page.url()).searchParams.get('var-state');
const breadcrumb = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelector('.india-choropleth__breadcrumb')?.textContent?.replace(/\s+/g, ' ').trim() ?? null
  );

test.describe('drill-down and the dashboard variable', () => {
  test('activating a state writes it to the variable', async ({ page }) => {
    await page.goto(`${DASH}?var-state=`);
    await waitForRegions(page, 8);
    expect(varState(page)).toBe('');

    await activate(page, 'Maharashtra');
    await waitForLevel(page, 'Maharashtra');

    expect(varState(page)).toBe('Maharashtra');
    // A panel with no relationship to the map follows the same variable.
    await expect(page.getByText('state=Maharashtra')).toBeVisible();
  });

  // Regression: the variable was written on every activation, so drilling a
  // district replaced the state name with the district's and any query filtering
  // `WHERE state = '$state'` returned nothing.
  test('activating a district leaves the state variable alone', async ({ page }) => {
    await page.goto(`${DASH}?var-state=`);
    await waitForRegions(page, 8);

    await activate(page, 'Maharashtra');
    await waitForLevel(page, 'Maharashtra');
    await activate(page, 'Pune');
    await waitForLevel(page, 'Pune');
    expect(varState(page)).toBe('Maharashtra');
  });

  // Regression: nothing fired on the way back, so the national map was on screen
  // while the rest of the dashboard was still scoped to a state.
  test('returning to the national map clears the variable', async ({ page }) => {
    await page.goto(`${DASH}?var-state=`);
    await waitForRegions(page, 8);

    await activate(page, 'Karnataka');
    await waitForLevel(page, 'Karnataka');
    expect(varState(page)).toBe('Karnataka');

    await page.locator('.india-choropleth__back').first().click();
    await page.waitForFunction(
      () => (document.querySelector('.india-choropleth__breadcrumb')?.textContent ?? '').trim() === 'All states',
      undefined,
      { timeout: 30_000 }
    );

    expect(varState(page)).toBe('');
  });

  // Regression: the URL is Grafana's source of truth, but the map ignored it and
  // reset to national, so a refresh or a shared link disagreed with the variable.
  test('a link that names a state opens drilled into it', async ({ page }) => {
    await page.goto(`${DASH}?var-state=Maharashtra`);
    await waitForLevel(page, 'Maharashtra');

    await page.reload();
    await waitForLevel(page, 'Maharashtra');
    expect(varState(page)).toBe('Maharashtra');
  });
});

test.describe('levels', () => {
  test('reaches sub-districts and colours them from the query', async ({ page }) => {
    await page.goto(`${DASH}?var-state=`);
    await waitForRegions(page, 8);

    await activate(page, 'Maharashtra');
    await waitForLevel(page, 'Maharashtra');
    await activate(page, 'Pune');
    await waitForLevel(page, 'Pune');

    const named = await page.evaluate((selector) => {
      const labels = [...document.querySelectorAll(selector)].map((n) => n.getAttribute('aria-label') ?? '');
      return {
        mulshi: labels.find((l) => l.startsWith('Mulshi')) ?? null,
        withData: labels.filter((l) => !/No data/i.test(l)).length,
      };
    }, REGION);

    // Values come from the sub-district column, via the custom loader.
    expect(named.mulshi).toContain('4');
    expect(named.withData).toBeGreaterThan(0);
  });
});

test.describe('fixed bands', () => {
  test('a colour means the same number regardless of its neighbours', async ({ page }) => {
    await page.goto(`${DASH}?var-state=`);
    await waitForRegions(page, 8);

    const fillOf = (name: string) =>
      page.evaluate(
        (label) =>
          [...document.querySelectorAll('path.india-choropleth__region')]
            .filter((n) => (n.getAttribute('aria-label') ?? '').startsWith(label))
            .map((n) => n.getAttribute('fill'))
            .pop() ?? null,
        name
      );

    // Edges are 25/50/100/200. Goa 72 and Kerala 259 fall in different bands;
    // Sikkim 21 and Ladakh 18 share the lowest one.
    const [goa, kerala, sikkim, ladakh] = await Promise.all([
      fillOf('Goa'),
      fillOf('Kerala'),
      fillOf('Sikkim'),
      fillOf('Ladakh'),
    ]);

    expect(goa).not.toBeNull();
    expect(goa).not.toBe(kerala);
    expect(sikkim).toBe(ladakh);
  });
});
