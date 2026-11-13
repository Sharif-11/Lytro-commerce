import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { leases, limitEvents, serviceStates } from '../../schema';

/** What an exact window allowed: whether the request may go, how many more may, and when a place frees up. */
export interface ExactVerdict {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the oldest counted request leaves the window. */
  resetMs: number;
}

/**
 * RED-11, D9-15 (Slice 9.4): an exact sliding window in PostgreSQL, so every API copy and every server together allow
 * exactly the limit. The bucket is held under an advisory lock until the transaction ends, so two requests at once
 * count each other. A refused request is not counted; a request counted inside a transaction that rolls back isn't
 * either (the payment session counted with its order).
 */
export class LimitEventRepository {
  /**
   * Takes a place in the bucket's window if one is free (`count`), or says whether one is (without `count`, for a
   * limit on failures checked before the attempt). Must run inside a transaction.
   */
  async take(
    db: Executor,
    bucket: string,
    limit: number,
    windowMs: number,
    now: Date,
    count = true,
  ): Promise<ExactVerdict> {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`limit:${bucket}`}, 0))`);
    const from = new Date(now.getTime() - windowMs);
    await db
      .delete(limitEvents)
      .where(and(eq(limitEvents.bucket, bucket), sql`${limitEvents.at} <= ${from}`));
    const rows = await db
      .select({
        total: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${limitEvents.at})`,
      })
      .from(limitEvents)
      .where(eq(limitEvents.bucket, bucket));
    const total = rows[0]?.total ?? 0;
    const oldest = rows[0]?.oldest ? new Date(rows[0].oldest) : null;
    const resetOf = (first: Date | null): number =>
      first === null ? 0 : Math.max(first.getTime() + windowMs - now.getTime(), 0);
    if (total >= limit) return { allowed: false, remaining: 0, resetMs: resetOf(oldest) };
    if (!count) return { allowed: true, remaining: limit - total, resetMs: resetOf(oldest) };
    await db.insert(limitEvents).values({ bucket, at: now });
    return { allowed: true, remaining: limit - total - 1, resetMs: resetOf(oldest ?? now) };
  }

  /** Deletes every bucket's rows older than a moment (the nightly purge), for buckets nobody checks again. */
  async purgeBefore(db: Executor, before: Date): Promise<number> {
    const rows = await db
      .delete(limitEvents)
      .where(lt(limitEvents.at, before))
      .returning({ bucket: limitEvents.bucket });
    return rows.length;
  }
}

/**
 * §107, §119, D9-15 (Slice 9.4): short claims on a name, shared by every API copy and server. Whoever inserts the row,
 * or finds it lapsed, holds it until `until`; nothing else waits on it, so a crashed holder blocks for no longer than
 * its lease. Works through PgBouncer's transaction mode, where a session's advisory lock would not.
 */
export class LeaseRepository {
  /** Takes the lease if it's free or lapsed. True if this holder has it now. */
  async acquire(
    db: Executor,
    key: string,
    holder: string,
    until: Date,
    now: Date,
  ): Promise<boolean> {
    const rows = await db
      .insert(leases)
      .values({ key, holder, until })
      .onConflictDoUpdate({
        target: leases.key,
        set: { holder, until },
        setWhere: or(lt(leases.until, now), eq(leases.holder, holder)),
      })
      .returning({ holder: leases.holder });
    return rows[0]?.holder === holder;
  }

  /** Gives the lease back early, if this holder still has it. */
  async release(db: Executor, key: string, holder: string): Promise<void> {
    await db.delete(leases).where(and(eq(leases.key, key), eq(leases.holder, holder)));
  }

  /** Deletes leases lapsed before a moment (the nightly purge). */
  async purgeLapsed(db: Executor, before: Date): Promise<number> {
    const rows = await db
      .delete(leases)
      .where(lt(leases.until, before))
      .returning({ key: leases.key });
    return rows.length;
  }
}

/**
 * RED-05 (Slice 9.4): a shared service's outage as every server sees it, so the operators get one email when it starts
 * and one when it ends. Each call says whether it was the one that changed the state.
 */
export class ServiceStateRepository {
  /** Marks the service down. True only for the call that started the outage. */
  async markDown(db: Executor, service: string, now: Date): Promise<boolean> {
    await db
      .insert(serviceStates)
      .values({ service, downSince: null, changedAt: now })
      .onConflictDoNothing();
    const rows = await db
      .update(serviceStates)
      .set({ downSince: now, changedAt: now })
      .where(and(eq(serviceStates.service, service), isNull(serviceStates.downSince)))
      .returning({ service: serviceStates.service });
    return rows.length > 0;
  }

  /** Marks the service back. Returns when the outage began, only for the call that ended it. */
  async markUp(db: Executor, service: string, now: Date): Promise<Date | null> {
    const before = await db
      .select({ downSince: serviceStates.downSince })
      .from(serviceStates)
      .where(and(eq(serviceStates.service, service), isNotNull(serviceStates.downSince)))
      .for('update');
    const since = before[0]?.downSince ?? null;
    if (since === null) return null;
    const rows = await db
      .update(serviceStates)
      .set({ downSince: null, changedAt: now })
      .where(and(eq(serviceStates.service, service), isNotNull(serviceStates.downSince)))
      .returning({ service: serviceStates.service });
    return rows.length > 0 ? new Date(since) : null;
  }
}
