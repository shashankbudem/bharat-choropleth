interface Entry<Value> {
  promise: Promise<Value>;
  settled: boolean;
}

/**
 * Instance-local LRU for expensive async results.
 *
 * Pending work is never evicted: doing so would allow a second caller to start
 * the same fetch and decode. Failed work is removed immediately so the next
 * request can retry. The size bound applies as soon as enough entries settle.
 */
export class SettledPromiseLru<Key, Value> {
  private readonly entries = new Map<Key, Entry<Value>>();

  constructor(private readonly maxSettledEntries: number) {}

  get size(): number {
    return this.entries.size;
  }

  getOrCreate(key: Key, load: () => Promise<Value>): Promise<Value> {
    const cached = this.entries.get(key);
    if (cached) {
      // Map insertion order is the recency list.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.promise;
    }

    const entry: Entry<Value> = { promise: Promise.resolve(undefined as Value), settled: false };
    entry.promise = load().then(
      (value) => {
        entry.settled = true;
        this.trim();
        return value;
      },
      (error: unknown) => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key);
        }
        throw error;
      }
    );
    this.entries.set(key, entry);
    this.trim();
    return entry.promise;
  }

  private trim(): void {
    while (this.entries.size > this.maxSettledEntries) {
      const oldestSettled = [...this.entries].find(([, entry]) => entry.settled);
      if (!oldestSettled) {
        return;
      }
      this.entries.delete(oldestSettled[0]);
    }
  }
}
