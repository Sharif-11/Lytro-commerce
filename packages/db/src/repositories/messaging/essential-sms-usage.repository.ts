import { and, eq, gte, sql } from 'drizzle-orm';
import type { SmsKind } from '@lytronix/validators';
import type { Executor } from '../../transactions';
import { essentialSmsUsage } from '../../schema';

export interface NewEssentialSmsUsage {
  tenantId: string;
  kind: SmsKind;
  units: number;
}

// AUTH-21: the tenant's free essential-SMS allowance usage, one row per SMS actually counted.
export class EssentialSmsUsageRepository {
  /** SMS-04: holds the shop's free SMS until the transaction ends, so the last one is taken once. */
  async holdAllowance(db: Executor, tenantId: string): Promise<void> {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`essential_sms:${tenantId}`}, 0))`,
    );
  }

  async insert(db: Executor, values: NewEssentialSmsUsage): Promise<string> {
    const [row] = await db
      .insert(essentialSmsUsage)
      .values(values)
      .returning({ id: essentialSmsUsage.id });
    if (!row) throw new Error('insert returned no essential SMS usage row');
    return row.id;
  }

  /** SMS-08: an SMS that never went out gives back what it took from the allowance. */
  async delete(db: Executor, id: string): Promise<void> {
    await db.delete(essentialSmsUsage).where(eq(essentialSmsUsage.id, id));
  }

  /** Sum of `units` for the tenant since `since` (inclusive), or every row ever when `since` is null. */
  async sumUnitsSince(db: Executor, tenantId: string, since: Date | null): Promise<number> {
    const where =
      since === null
        ? eq(essentialSmsUsage.tenantId, tenantId)
        : and(eq(essentialSmsUsage.tenantId, tenantId), gte(essentialSmsUsage.createdAt, since));
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${essentialSmsUsage.units}), 0)` })
      .from(essentialSmsUsage)
      .where(where);
    return Number(rows[0]?.total ?? 0);
  }
}
