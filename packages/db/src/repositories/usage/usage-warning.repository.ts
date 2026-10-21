import { and, eq, sql } from 'drizzle-orm';
import { usageWarnings } from '../../schema';
import type { Executor } from '../../transactions';

// LIM-01: the highest share of each limit a shop was warned of, per cycle.
export class UsageWarningRepository {
  /** The highest share already sent for the metric this cycle, 0 when none. */
  async warned(db: Executor, tenantId: string, metric: string, cycleStart: Date): Promise<number> {
    const rows = await db
      .select({ warnedPercent: usageWarnings.warnedPercent })
      .from(usageWarnings)
      .where(
        and(
          eq(usageWarnings.tenantId, tenantId),
          eq(usageWarnings.metric, metric),
          eq(usageWarnings.cycleStart, cycleStart),
        ),
      )
      .limit(1);
    return rows[0]?.warnedPercent ?? 0;
  }

  /** Records a share sent; never lowers one already higher. */
  async setWarned(
    db: Executor,
    tenantId: string,
    metric: string,
    cycleStart: Date,
    percent: number,
  ): Promise<void> {
    await db
      .insert(usageWarnings)
      .values({ tenantId, metric, cycleStart, warnedPercent: percent })
      .onConflictDoUpdate({
        target: [usageWarnings.tenantId, usageWarnings.metric, usageWarnings.cycleStart],
        set: {
          warnedPercent: sql`GREATEST(${usageWarnings.warnedPercent}, ${percent})`,
          updatedAt: new Date(),
        },
      });
  }

  /** LIF-19: the day-60 deletion takes a shop's warnings with the rest. */
  async deleteForTenant(db: Executor, tenantId: string): Promise<void> {
    await db.delete(usageWarnings).where(eq(usageWarnings.tenantId, tenantId));
  }
}
