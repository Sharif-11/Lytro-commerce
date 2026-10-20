import { Inject, Injectable, Logger } from '@nestjs/common';
import { withOverrides } from '@lytronix/validators';
import type { ApiKeyStore } from '../ports/api-key-store';
import { API_CLOCK, API_KEY_STORE } from '../tokens';
import type { ApiShop, AuthenticatedKey } from '../types/public-api';
import { hashOfKey } from './api-key-value';
import { ExpiringCache } from './expiring-cache';

// API-03: how long this server trusts what it read about a key, a shop or a website address. A key revoked on this
// server is forgotten at once; on another, within this long.
const LOOKUP_CACHE_MS = 5_000;
const LOOKUP_CACHE_ENTRIES = 10_000;
// How often a key's "last used" is written: once a minute is enough to show it, and keeps the write off most requests.
const LAST_USED_EVERY_MS = 60_000;

/**
 * API-03 to API-05, API-08, API-23, PLN-11: what the public API reads before it lets a request through -- the key
 * a presented value is, whether a website address is registered on any live key, and the shop a key acts for with
 * its limits -- each kept for at most five seconds, so a request costs no database read on most calls.
 */
@Injectable()
export class ApiKeyAuthenticator {
  private readonly logger = new Logger('ApiKeys');
  private readonly keys = new ExpiringCache<AuthenticatedKey | null>(
    LOOKUP_CACHE_MS,
    LOOKUP_CACHE_ENTRIES,
  );
  private readonly origins = new ExpiringCache<boolean>(LOOKUP_CACHE_MS, LOOKUP_CACHE_ENTRIES);
  private readonly shops = new ExpiringCache<ApiShop | null>(LOOKUP_CACHE_MS, LOOKUP_CACHE_ENTRIES);
  private readonly touched = new ExpiringCache<true>(LAST_USED_EVERY_MS, LOOKUP_CACHE_ENTRIES);

  constructor(
    @Inject(API_KEY_STORE) private readonly store: ApiKeyStore,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The key this value is, revoked or expired ones included; null for none. */
  async keyOf(value: string): Promise<AuthenticatedKey | null> {
    const hash = hashOfKey(value);
    const now = this.clock().getTime();
    const cached = this.keys.get(hash, now);
    if (cached !== undefined) return cached;
    const row = await this.store.findByHash(hash);
    const key = row
      ? {
          id: row.id,
          tenantId: row.tenantId,
          websites: row.websites,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
        }
      : null;
    this.keys.set(hash, key, now);
    return key;
  }

  /** API-23: whether a live key of any shop registers this website address. */
  async isRegistered(origin: string): Promise<boolean> {
    const now = this.clock();
    const cached = this.origins.get(origin, now.getTime());
    if (cached !== undefined) return cached;
    const registered = await this.store.isOriginRegistered(origin, now);
    this.origins.set(origin, registered, now.getTime());
    return registered;
  }

  /** The shop a key acts for, with its snapshot and overrides laid over it (PLN-11); null when there is none. */
  async shopOf(tenantId: string): Promise<ApiShop | null> {
    const now = this.clock().getTime();
    const cached = this.shops.get(tenantId, now);
    if (cached !== undefined) return cached;
    const row = await this.store.findShop(tenantId);
    const shop = row
      ? { row, limits: withOverrides(row.planSnapshot, await this.store.listOverrides(tenantId)) }
      : null;
    this.shops.set(tenantId, shop, now);
    return shop;
  }

  /** API-01: records that the key was used, at most once a minute, never holding up the request. */
  touch(keyId: string): void {
    const now = this.clock();
    if (this.touched.get(keyId, now.getTime()) !== undefined) return;
    this.touched.set(keyId, true, now.getTime());
    this.store.touchLastUsed(keyId, now).catch((error: unknown) => {
      this.logger.warn(`could not record a key's last use: ${String(error)}`);
    });
  }

  /** API-03: a key changed or revoked on this server is read again on its next use. */
  forget(keyHash: string): void {
    this.keys.delete(keyHash);
    this.origins.clear();
  }
}
