import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SettledPromiseLru } from '../src/promiseLru';

const mode = process.argv[2];
if (mode !== 'unbounded' && mode !== 'bounded') {
  throw new Error('usage: cache-memory.ts <unbounded|bounded>');
}
if (!global.gc) {
  throw new Error('run Node with --expose-gc');
}

const dataRoot = resolve(__dirname, '../../../data/generated');
const roots = [
  join(dataRoot, 'current-2019-districts/districts'),
  join(dataRoot, 'current-2019-subdistricts/subdistricts'),
];
const files = roots.flatMap((root) =>
  readdirSync(root)
    .filter((name) => name.endsWith('.topo.json'))
    .map((name) => join(root, name))
);
const copies = Number(process.env.BENCH_CACHE_COPIES ?? 5);

const collect = () => {
  for (let index = 0; index < 5; index += 1) {
    global.gc?.();
  }
};

const loadAll = async () => {
  if (mode === 'unbounded') {
    const caches: Map<string, Promise<unknown>>[] = [];
    for (let copy = 0; copy < copies; copy += 1) {
      const cache = new Map<string, Promise<unknown>>();
      for (const file of files) {
        cache.set(file, Promise.resolve(JSON.parse(readFileSync(file, 'utf8'))));
      }
      caches.push(cache);
    }
    return caches;
  }

  const caches: SettledPromiseLru<string, unknown>[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    const cache = new SettledPromiseLru<string, unknown>(8);
    for (const file of files) {
      await cache.getOrCreate(file, async () => JSON.parse(readFileSync(file, 'utf8')));
    }
    caches.push(cache);
  }
  return caches;
};

async function main() {
  collect();
  const before = process.memoryUsage().heapUsed;
  const cache = await loadAll();
  collect();
  const after = process.memoryUsage().heapUsed;

  console.log(
    JSON.stringify({
      mode,
      realTopologyFiles: files.length,
      simulatedPanelInstances: copies,
      retainedEntries: cache.reduce((sum, instance) => sum + instance.size, 0),
      retainedHeapBytes: after - before,
    })
  );
}

void main();
