import { and, eq, gte, sql } from 'drizzle-orm';
import type { SmsKind } from '@lytronix/validators';
import type { Executor } from '../../transactions';
import { essentialSmsUsage } from '../../schema';

export interface NewEssentialSmsUsage {
  tenantId: string;
  kind: SmsKind;
  parts: number;
}

// AUTH-21: the tenant's free essential-SMS allowance usage, one row per SMS actually counted.
export class EssentialSmsUsageRepository {
  async insert(db: Executor, values: NewEssentialSmsUsage): Promise<void> {
    await db.insert(essentialSmsUsage).values(values);
  }

  /** Sum of `parts` for the tenant since `since` (inclusive), or every row ever when `since` is null. */
  async sumPartsSince(db: Executor, tenantId: string, since: Date | null): Promise<number> {
    const where =
      since === null
        ? eq(essentialSmsUsage.tenantId, tenantId)
        : and(eq(essentialSmsUsage.tenantId, tenantId), gte(essentialSmsUsage.createdAt, since));
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${essentialSmsUsage.parts}), 0)` })
      .from(essentialSmsUsage)
      .where(where);
    return Number(rows[0]?.total ?? 0);
  }
}
