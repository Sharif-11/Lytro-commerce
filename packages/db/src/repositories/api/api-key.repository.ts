import { and, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { apiKeys, apiUsage, tenants, type InsertApiKey, type SelectApiKey } from '../../schema';
import type { Executor } from '../../transactions';
import type { TenantLookupRow } from '../tenancy/tenant.repository';

/** A key to store: its hash and prefix, never its value. */
export type NewApiKey = Omit<
  InsertApiKey,
  'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt' | 'revokedBy'
>;

/** What the public API needs about a shop a key belongs to: whether it is open, its limits and its billing cycle. */
export interface ApiShopRow extends TenantLookupRow {
  shopName: string;
  planSnapshot: (typeof tenants.$inferSelect)['planSnapshot'];
  periodStart: Date | null;
  createdAt: Date;
}

// API-01 to API-05, API-08, API-23: a shop's API keys, in the control schema (the API finds a key before it knows
// the shop). A key is never deleted while its shop lives; revoking it keeps the row.
export class ApiKeyRepository {
  async insert(db: Executor, row: NewApiKey): Promise<SelectApiKey> {
    const [made] = await db.insert(apiKeys).values(row).returning();
    if (!made) throw new Error('insert returned no api key');
    return made;
  }

  /** The shop's keys, newest first, revoked ones included. */
  listForTenant(db: Executor, tenantId: string): Promise<SelectApiKey[]> {
    return db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenantId))
      .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
  }

  async findForTenant(db: Executor, tenantId: string, id: string): Promise<SelectApiKey | null> {
    const rows = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** API-05: the key with this hash, whatever its state; the caller judges revocation and expiry. */
  async findByHash(db: Executor, keyHash: string): Promise<SelectApiKey | null> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    return rows[0] ?? null;
  }

  /**
   * API-02: the shop's live keys (not revoked, not expired), counted under a lock on the shop's keys, so two keys
   * made at once cannot both pass the limit.
   */
  async lockAndCountLive(db: Executor, tenantId: string, now: Date): Promise<number> {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`api_keys:${tenantId}`}, 0))`,
    );
    const [row] = await db
      .select({ live: count() })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.tenantId, tenantId),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
        ),
      );
    return row?.live ?? 0;
  }

  async update(
    db: Executor,
    tenantId: string,
    id: string,
    patch: { name?: string; websites?: string[] },
  ): Promise<SelectApiKey | null> {
    const [row] = await db
      .update(apiKeys)
      .set(patch)
      .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
      .returning();
    return row ?? null;
  }

  /** API-03: revokes the key if it is live; the key as it now is. */
  async revoke(
    db: Executor,
    tenantId: string,
    id: string,
    by: string | null,
    at: Date,
  ): Promise<SelectApiKey | null> {
    await db
      .update(apiKeys)
      .set({ revokedAt: at, revokedBy: by })
      .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
    return this.findForTenant(db, tenantId, id);
  }

  async touchLastUsed(db: Executor, id: string, at: Date): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, id));
  }

  /** API-23: whether a live public key of any shop registers this origin, for a preflight that carries no key. */
  async isOriginRegistered(db: Executor, origin: string, now: Date): Promise<boolean> {
    const rows = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          sql`${apiKeys.websites} @> ARRAY[${origin}]::text[]`,
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** MED-13: every live key's website addresses, by shop, for the media Worker's shared store. */
  async listLiveWebsites(
    db: Executor,
    now: Date,
  ): Promise<{ tenantId: string; websites: string[] }[]> {
    return db
      .select({ tenantId: apiKeys.tenantId, websites: apiKeys.websites })
      .from(apiKeys)
      .where(
        and(isNull(apiKeys.revokedAt), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))),
      );
  }

  /** What the public API needs about the shop a key belongs to. */
  async findShop(db: Executor, tenantId: string): Promise<ApiShopRow | null> {
    const rows = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        state: tenants.state,
        suspendedAt: tenants.suspendedAt,
        shopName: tenants.shopName,
        planSnapshot: tenants.planSnapshot,
        periodStart: tenants.periodStart,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** LIF-19: a lapsed shop's keys and request counts, at day 60. */
  async deleteAllForTenant(db: Executor, tenantId: string): Promise<void> {
    await db.delete(apiUsage).where(eq(apiUsage.tenantId, tenantId));
    await db.delete(apiKeys).where(eq(apiKeys.tenantId, tenantId));
  }
}
