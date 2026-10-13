import { SECOND_MS } from '../../../common/time';
import type { RateValue } from '../types/rate';

// D2-7: a process-memory cache of the current rate values, same shape as TenantCache (R5), 5-second TTL.
interface Entry {
  value: RateValue;
  expiresAt: number;
}

export class RateCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 5 * SECOND_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): RateValue | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: RateValue): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** RAT-02: a rate change must take effect immediately, not after the TTL expires on its own. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
