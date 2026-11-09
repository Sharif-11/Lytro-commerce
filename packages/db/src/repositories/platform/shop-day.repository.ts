import { and, desc, gte, inArray, lte, sql } from 'drizzle-orm';
import type { LedgerEntryType, TenantState } from '@lytronix/validators';
import type { Executor } from '../../transactions';
import { shopDays } from '../../schema';

/** D8-9: one shop's day as the night records it. */
export interface ShopDayRow {
  tenantId: string;
  day: string;
  state: TenantState;
  planId: string | null;
  storageBytes: number;
  smsUnits: number;
  spend: Partial<Record<LedgerEntryType, string>>;
  givenBack: string;
}

/** A figure for one shop, the larger first. */
export interface ShopFigure {
  tenantId: string;
  value: number;
}

// ADM-09, D8-9 (Phase 8 Slice 8.4): each shop's recorded days, and the sums across shops the reports read. Every
// figure across shops comes from here or from Lytro's own tables, never from inside a shop's rows.
export class ShopDayRepository {
  /** Records a shop's day, replacing what an earlier run recorded for it. */
  async upsert(db: Executor, row: ShopDayRow): Promise<void> {
    await db
      .insert(shopDays)
      .values(row)
      .onConflictDoUpdate({
        target: [shopDays.tenantId, shopDays.day],
        set: {
          state: row.state,
          planId: row.planId,
          storageBytes: row.storageBytes,
          smsUnits: row.smsUnits,
          spend: row.spend,
          givenBack: row.givenBack,
          recordedAt: sql`now()`,
        },
      });
  }

  /** Which of these days the shop already has recorded. */
  async recorded(db: Executor, tenantId: string, days: readonly string[]): Promise<Set<string>> {
    if (days.length === 0) return new Set();
    const rows = await db
      .select({ day: shopDays.day })
      .from(shopDays)
      .where(and(sql`${shopDays.tenantId} = ${tenantId}`, inArray(shopDays.day, [...days])));
    return new Set(rows.map((row) => row.day));
  }

  /** D8-40: what shops spent from their balances each day, by ledger type, in taka. */
  async spendByDay(
    db: Executor,
    from: string,
    to: string,
  ): Promise<{ day: string; type: LedgerEntryType; amount: string }[]> {
    const result = await db.execute<{ day: string; type: LedgerEntryType; amount: string }>(sql`
      SELECT d.day::text AS day, s.key AS type, sum(s.value::numeric)::numeric(14, 2)::text AS amount
      FROM ${shopDays} d, jsonb_each_text(d.spend) AS s(key, value)
      WHERE d.day BETWEEN ${from} AND ${to}
      GROUP BY d.day, s.key
      ORDER BY d.day, s.key`);
    return result.rows;
  }

  /** What balances gave back each day (reversed charges), in taka. */
  async givenBackByDay(
    db: Executor,
    from: string,
    to: string,
  ): Promise<{ day: string; amount: string }[]> {
    const rows = await db
      .select({
        day: shopDays.day,
        amount: sql<string>`sum(${shopDays.givenBack})::numeric(14, 2)::text`,
      })
      .from(shopDays)
      .where(and(gte(shopDays.day, from), lte(shopDays.day, to)))
      .groupBy(shopDays.day)
      .orderBy(shopDays.day);
    return rows;
  }

  /** D8-10: the shops that sent the most SMS units in the period. */
  async smsTop(db: Executor, from: string, to: string, limit: number): Promise<ShopFigure[]> {
    const units = sql<number>`sum(${shopDays.smsUnits})::int`;
    return db
      .select({ tenantId: shopDays.tenantId, value: units })
      .from(shopDays)
      .where(and(gte(shopDays.day, from), lte(shopDays.day, to)))
      .groupBy(shopDays.tenantId)
      .having(sql`sum(${shopDays.smsUnits}) > 0`)
      .orderBy(desc(units), shopDays.tenantId)
      .limit(limit);
  }

  /** D8-10: the shops holding the most storage, each as last recorded in the period. */
  async storageTop(db: Executor, from: string, to: string, limit: number): Promise<ShopFigure[]> {
    const result = await db.execute<{ tenant_id: string; value: string }>(sql`
      SELECT tenant_id, storage_bytes::text AS value FROM (
        SELECT DISTINCT ON (tenant_id) tenant_id, storage_bytes
        FROM ${shopDays}
        WHERE day BETWEEN ${from} AND ${to}
        ORDER BY tenant_id, day DESC
      ) latest
      WHERE storage_bytes > 0
      ORDER BY storage_bytes DESC, tenant_id
      LIMIT ${limit}`);
    return result.rows.map((row) => ({ tenantId: row.tenant_id, value: Number(row.value) }));
  }

  /** D8-41: each day, how many shops moved into one of these states from another the day before. */
  async movedIntoByDay(
    db: Executor,
    from: string,
    to: string,
    states: readonly TenantState[],
  ): Promise<{ day: string; count: number }[]> {
    if (states.length === 0) return [];
    const list = sql.join(
      states.map((state) => sql`${state}`),
      sql`, `,
    );
    const result = await db.execute<{ day: string; count: string }>(sql`
      SELECT day::text AS day, count(*)::text AS count FROM (
        SELECT day, state, lag(state) OVER (PARTITION BY tenant_id ORDER BY day) AS before
        FROM ${shopDays}
        WHERE day BETWEEN (${from}::date - 1) AND ${to}
      ) moves
      WHERE day BETWEEN ${from} AND ${to}
        AND state IN (${list})
        AND before IS NOT NULL AND before NOT IN (${list})
      GROUP BY day
      ORDER BY day`);
    return result.rows.map((row) => ({ day: row.day, count: Number(row.count) }));
  }
}
