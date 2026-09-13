import { SettledPromiseLru } from './promiseLru';

describe('SettledPromiseLru', () => {
  it('reuses a pending or settled load for the same key', async () => {
    const cache = new SettledPromiseLru<string, number>(2);
    const load = jest.fn(async () => 7);

    const first = cache.getOrCreate('a', load);
    const second = cache.getOrCreate('a', load);

    expect(second).toBe(first);
    await expect(second).resolves.toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used settled entry', async () => {
    const cache = new SettledPromiseLru<string, string>(2);

    await cache.getOrCreate('a', async () => 'a');
    await cache.getOrCreate('b', async () => 'b');
    await cache.getOrCreate('a', async () => 'never');
    await cache.getOrCreate('c', async () => 'c');

    expect(cache.size).toBe(2);
    const reload = jest.fn(async () => 'b2');
    await expect(cache.getOrCreate('b', reload)).resolves.toBe('b2');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never evicts in-flight work', async () => {
    const cache = new SettledPromiseLru<string, string>(1);
    let resolveA!: (value: string) => void;
    const pendingA = new Promise<string>((resolve) => (resolveA = resolve));

    const firstA = cache.getOrCreate('a', () => pendingA);
    await cache.getOrCreate('b', async () => 'b');
    const secondA = cache.getOrCreate('a', async () => 'duplicate');

    expect(secondA).toBe(firstA);
    resolveA('a');
    await expect(firstA).resolves.toBe('a');
    expect(cache.size).toBe(1);
  });

  it('removes a failed load so the next call can retry', async () => {
    const cache = new SettledPromiseLru<string, number>(2);
    await expect(cache.getOrCreate('a', async () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');

    await expect(cache.getOrCreate('a', async () => 9)).resolves.toBe(9);
  });
});
