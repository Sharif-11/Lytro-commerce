import {
  MEDIA_BLOCKED_KEY,
  mediaOriginsKey,
  type MediaBlockReason,
  type MediaBlockedList,
} from '@lytronix/shared-types';

// MED-10, BND-02: the blocked list is read again at most this often, so a change the server makes reaches every
// location within about two minutes (the server's minute, the store's own spreading, and this).
const BLOCKED_FOR_MS = 15_000;
// MED-13: a shop's website addresses change rarely; each is kept this long.
const ORIGINS_FOR_MS = 60_000;
const ORIGINS_KEPT = 5_000;

interface Kept<T> {
  value: T;
  at: number;
}

/**
 * MED-10, MED-13: what the server tells the media Worker through the shared store -- which shops are blocked and why,
 * and each shop's registered website addresses -- kept in this Worker's memory for a short while, so most requests
 * read nothing. If the store cannot be read, the last answer stands: the store being away never blocks media.
 */
export class EdgeState {
  private blocked: Kept<MediaBlockedList> | null = null;
  private readonly origins = new Map<string, Kept<readonly string[]>>();

  constructor(
    private readonly kv: KVNamespace,
    private readonly now: () => number,
  ) {}

  async blockReason(tenantId: string): Promise<MediaBlockReason | null> {
    const at = this.now();
    if (this.blocked === null || at - this.blocked.at >= BLOCKED_FOR_MS) {
      try {
        const list = await this.kv.get<MediaBlockedList>(MEDIA_BLOCKED_KEY, 'json');
        this.blocked = { value: list ?? {}, at };
      } catch (error) {
        console.error('media worker: the blocked list could not be read', error);
        this.blocked = { value: this.blocked?.value ?? {}, at };
      }
    }
    return this.blocked.value[tenantId] ?? null;
  }

  async originsOf(tenantId: string): Promise<readonly string[]> {
    const at = this.now();
    const kept = this.origins.get(tenantId);
    if (kept && at - kept.at < ORIGINS_FOR_MS) return kept.value;
    let value: readonly string[];
    try {
      value = (await this.kv.get<string[]>(mediaOriginsKey(tenantId), 'json')) ?? [];
    } catch (error) {
      console.error('media worker: website addresses could not be read', error);
      value = kept?.value ?? [];
    }
    if (this.origins.size >= ORIGINS_KEPT) this.origins.clear();
    this.origins.set(tenantId, { value, at });
    return value;
  }
}
