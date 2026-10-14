import { SECOND_MS } from '../../../common/time';
import type { PlatformSettingValue } from '../types/platform-setting';

// D2-7: a process-memory cache of the current setting values, same shape as RateCache, 5-second TTL.
interface Entry {
  value: PlatformSettingValue;
  expiresAt: number;
}

export class PlatformSettingsCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 5 * SECOND_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): PlatformSettingValue | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: PlatformSettingValue): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** A setting change must take effect immediately, not after the TTL expires on its own. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
