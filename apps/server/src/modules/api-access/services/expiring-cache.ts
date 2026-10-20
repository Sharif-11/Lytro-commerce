/**
 * A small in-memory cache whose entries live a fixed time. Bounded: past its size it first drops what has expired,
 * then everything, so a flood of lookups for keys that do not exist cannot grow it without limit.
 */
export class ExpiringCache<V> {
  private readonly entries = new Map<string, { value: V; until: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  /** The entry, or undefined when there is none or it has expired. */
  get(key: string, now: number): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.until <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, now: number): void {
    if (this.entries.size >= this.maxEntries) {
      for (const [stored, entry] of this.entries) {
        if (entry.until <= now) this.entries.delete(stored);
      }
      if (this.entries.size >= this.maxEntries) this.entries.clear();
    }
    this.entries.set(key, { value, until: now + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
