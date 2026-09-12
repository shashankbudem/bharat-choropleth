import { chromium } from '@playwright/test';

const runs = Number(process.env.BENCH_RUNS ?? 20);
const variant = process.env.BENCH_VARIANT ?? 'unknown';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

await context.addInitScript(() => {
  window.__bharatBench = { commits: 0 };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject: () => 1,
    onCommitFiberRoot: () => {
      window.__bharatBench.commits += 1;
    },
    onCommitFiberUnmount: () => {},
  };
});

const page = await context.newPage();
const topologyRequests = [];
page.on('request', (request) => {
  if (request.url().includes('/data/generated/')) {
    topologyRequests.push(request.url());
  }
});

await page.goto('http://localhost:3000/d/bharat-e2e/bharat-choropleth-e2e?var-state=Maharashtra');
const panel = page.getByRole('region', { name: 'E2E fixture' });
const breadcrumb = panel.locator('.india-choropleth__breadcrumb');
const stateVariable = page.getByRole('textbox', { name: 'Enter value' });

const waitForLevel = async (name) => {
  await breadcrumb.filter({ hasText: name }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(100);
};

const activate = async (name) => {
  await panel.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`) }).click();
  await waitForLevel(name);
};

const switchState = async (name) => {
  await stateVariable.fill(name);
  await page.evaluate(() => {
    window.__bharatBench.commits = 0;
    window.__bharatBench.mutations = 0;
    window.__bharatBench.started = performance.now();
    window.__bharatBench.observer?.disconnect();
    const panelElement = document.querySelector('[aria-label="E2E fixture"]');
    const observer = new MutationObserver(() => {
      window.__bharatBench.mutations += 1;
    });
    if (panelElement) {
      observer.observe(panelElement, { childList: true, subtree: true, attributes: true });
    }
    window.__bharatBench.observer = observer;
  });
  await stateVariable.press('Enter');
  await waitForLevel(name);
  return page.evaluate(() => ({
    latencyMs: performance.now() - window.__bharatBench.started,
    commits: window.__bharatBench.commits,
    mutations: window.__bharatBench.mutations,
  }));
};

await waitForLevel('Maharashtra');
await activate('Pune');
await switchState('Karnataka');
await activate('Bengaluru (Urban)');
await switchState('Maharashtra');
topologyRequests.length = 0;

const samples = [];
let current = 'Maharashtra';
for (let index = 0; index < runs; index += 1) {
  await activate(current === 'Maharashtra' ? 'Pune' : 'Bengaluru (Urban)');
  const target = current === 'Maharashtra' ? 'Karnataka' : 'Maharashtra';
  samples.push(await switchState(target));
  current = target;
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};
const summarize = (key) => {
  const values = samples.map((sample) => sample[key]);
  return {
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    min: Math.min(...values),
    max: Math.max(...values),
  };
};

console.log(
  JSON.stringify({
    variant,
    runs,
    latencyMs: summarize('latencyMs'),
    reactCommits: summarize('commits'),
    panelMutationBatches: summarize('mutations'),
    topologyRequestsAfterWarmup: topologyRequests.length,
  })
);

await browser.close();
