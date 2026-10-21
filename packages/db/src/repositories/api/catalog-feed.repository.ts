import { eq } from 'drizzle-orm';
import { catalogFeeds, type SelectCatalogFeed } from '../../schema';
import type { Executor } from '../../transactions';

// FED-01, FED-05: each shop's catalog feed link. In the control schema: a feed request is matched by its token's hash
// before the shop is known.
export class CatalogFeedRepository {
  /** FED-01: the shop a feed token belongs to; null for no shop's. */
  async findByHash(db: Executor, tokenHash: Buffer): Promise<string | null> {
    const rows = await db
      .select({ tenantId: catalogFeeds.tenantId })
      .from(catalogFeeds)
      .where(eq(catalogFeeds.tokenHash, tokenHash))
      .limit(1);
    return rows[0]?.tenantId ?? null;
  }

  async findForTenant(db: Executor, tenantId: string): Promise<SelectCatalogFeed | null> {
    const rows = await db
      .select()
      .from(catalogFeeds)
      .where(eq(catalogFeeds.tenantId, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** The shop's first link, unless one was made meanwhile; the link the shop has either way. */
  async insertFirst(
    db: Executor,
    values: { tenantId: string; tokenHash: Buffer; tokenEnc: Buffer },
  ): Promise<SelectCatalogFeed> {
    await db.insert(catalogFeeds).values(values).onConflictDoNothing({
      target: catalogFeeds.tenantId,
    });
    const row = await this.findForTenant(db, values.tenantId);
    if (!row) throw new Error('no catalog feed row after insert');
    return row;
  }

  /** FED-05: a new link in place of the old, which stops working at once. */
  async replace(
    db: Executor,
    values: { tenantId: string; tokenHash: Buffer; tokenEnc: Buffer },
  ): Promise<SelectCatalogFeed> {
    const rows = await db
      .insert(catalogFeeds)
      .values({ ...values, rotatedAt: new Date() })
      .onConflictDoUpdate({
        target: catalogFeeds.tenantId,
        set: { tokenHash: values.tokenHash, tokenEnc: values.tokenEnc, rotatedAt: new Date() },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('upsert returned no catalog feed row');
    return row;
  }

  /** LIF-19: the day-60 deletion. */
  async deleteForTenant(db: Executor, tenantId: string): Promise<void> {
    await db.delete(catalogFeeds).where(eq(catalogFeeds.tenantId, tenantId));
  }
}
