// R5: a process-memory cache of host-to-shop lookups. Entries live for 60 seconds, and the size is
// capped so a flood of distinct hosts cannot exhaust memory. Cross-server invalidation comes in Phase 2.

export interface CachedTenant {
  id: string;
  slug: string;
  state: string;
}

interface Entry {
  value: CachedTenant;
  expiresAt: number;
}

export class TenantCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  get(host: string): CachedTenant | undefined {
    const entry = this.entries.get(host);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(host);
      return undefined;
    }
    return entry.value;
  }

  set(host: string, value: CachedTenant): void {
    if (!this.entries.has(host) && this.entries.size >= this.maxEntries) {
      // Evict the oldest insertion; Map keeps insertion order.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(host, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** Drops every host that resolves to the shop, so a change takes effect on the next request. */
  invalidateTenant(tenantId: string): void {
    for (const [host, entry] of this.entries) {
      if (entry.value.id === tenantId) this.entries.delete(host);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
