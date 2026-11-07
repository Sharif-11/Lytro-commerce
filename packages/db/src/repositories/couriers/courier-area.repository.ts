import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  max,
  sql,
  type SQL,
} from 'drizzle-orm';
import { CourierAreaMatch, CourierAreaState, type CourierKey } from '@lytronix/validators';
import { courierAreas, type NewCourierArea, type SelectCourierArea } from '../../schema';
import type { Executor, Transaction } from '../../transactions';

/** What a courier lists about one area, as an adapter read it. */
export interface ListedCourierArea {
  areaCode: string;
  name: string;
  districtName: string;
  postCode: string | null;
}

/** Where a newly listed area goes, worked out by the server's matching. */
export interface MatchedCourierArea extends ListedCourierArea {
  zillaId: number | null;
  thanaId: number | null;
  suggestedThanaId: number | null;
  match: CourierAreaMatch;
}

export interface CourierAreaFilter {
  courierKey: CourierKey;
  state?: CourierAreaState;
  zillaId?: number;
  q?: string;
}

/** Slice 6.7: how a courier's list stands, by the filters the operator picks from, and when it was last read. */
export interface CourierAreaSummary {
  all: number;
  suggested: number;
  unassigned: number;
  assigned: number;
  retired: number;
  lastReadAt: Date | null;
}

/** Counts a refresh reports. */
export interface CourierAreaRefreshCounts {
  added: number;
  renamed: number;
  retired: number;
  back: number;
}

function escapeLike(words: string): string {
  return words.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * CUS-10, CUS-12 (Phase 6 Slice 6.4): a courier's area list, platform-wide reference data in `control`, so no tenant context and no
 * row-level security. A refresh writes what the courier lists and never undoes what the operator placed.
 */
export class CourierAreaRepository {
  async list(
    db: Executor,
    filter: CourierAreaFilter,
    window: { offset: number; limit: number },
  ): Promise<{ rows: SelectCourierArea[]; total: number }> {
    const where = this.whereOf(filter);
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(courierAreas)
        .where(where)
        .orderBy(asc(courierAreas.districtName), asc(courierAreas.name))
        .offset(window.offset)
        .limit(window.limit),
      db.select({ total: count() }).from(courierAreas).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  }

  /** Slice 6.7: each state's count, as `list` filters them, and the last time the list was read. */
  async summary(db: Executor, courierKey: CourierKey): Promise<CourierAreaSummary> {
    const live = isNull(courierAreas.retiredAt);
    const [row] = await db
      .select({
        all: count(),
        suggested: sql<number>`count(*) FILTER (WHERE ${and(live, eq(courierAreas.match, CourierAreaMatch.Suggested))})::int`,
        unassigned: sql<number>`count(*) FILTER (WHERE ${and(live, eq(courierAreas.match, CourierAreaMatch.None))})::int`,
        assigned: sql<number>`count(*) FILTER (WHERE ${and(live, isNotNull(courierAreas.thanaId))})::int`,
        retired: sql<number>`count(*) FILTER (WHERE ${isNotNull(courierAreas.retiredAt)})::int`,
        lastReadAt: max(courierAreas.refreshedAt),
      })
      .from(courierAreas)
      .where(eq(courierAreas.courierKey, courierKey));
    return {
      all: row?.all ?? 0,
      suggested: row?.suggested ?? 0,
      unassigned: row?.unassigned ?? 0,
      assigned: row?.assigned ?? 0,
      retired: row?.retired ?? 0,
      lastReadAt: row?.lastReadAt ?? null,
    };
  }

  async findById(db: Executor, id: string): Promise<SelectCourierArea | null> {
    const [row] = await db.select().from(courierAreas).where(eq(courierAreas.id, id));
    return row ?? null;
  }

  async findByCode(
    db: Executor,
    courierKey: CourierKey,
    areaCode: string,
  ): Promise<SelectCourierArea | null> {
    const [row] = await db
      .select()
      .from(courierAreas)
      .where(and(eq(courierAreas.courierKey, courierKey), eq(courierAreas.areaCode, areaCode)));
    return row ?? null;
  }

  /** CUS-12: the live areas a thana holds, counted or suggested. */
  inThana(db: Executor, courierKey: CourierKey, thanaId: number): Promise<SelectCourierArea[]> {
    return db
      .select()
      .from(courierAreas)
      .where(
        and(
          eq(courierAreas.courierKey, courierKey),
          isNull(courierAreas.retiredAt),
          sql`(${courierAreas.thanaId} = ${thanaId} OR (${courierAreas.thanaId} IS NULL AND ${courierAreas.suggestedThanaId} = ${thanaId}))`,
        ),
      )
      .orderBy(asc(courierAreas.name));
  }

  /** CUS-12: a zilla's live areas, by name, for a booking's search. */
  inZilla(
    db: Executor,
    courierKey: CourierKey,
    zillaId: number,
    q: string | undefined,
    limit: number,
  ): Promise<SelectCourierArea[]> {
    return db
      .select()
      .from(courierAreas)
      .where(
        and(
          eq(courierAreas.courierKey, courierKey),
          eq(courierAreas.zillaId, zillaId),
          isNull(courierAreas.retiredAt),
          ...(q !== undefined ? [ilike(courierAreas.name, `%${escapeLike(q)}%`)] : []),
        ),
      )
      .orderBy(asc(courierAreas.name))
      .limit(limit);
  }

  /** Every code this courier has, live or retired, for a refresh to compare against. */
  allOf(db: Executor, courierKey: CourierKey): Promise<SelectCourierArea[]> {
    return db.select().from(courierAreas).where(eq(courierAreas.courierKey, courierKey));
  }

  /**
   * One refresh, in one transaction: new areas go in with their match, a renamed one takes its new name and district, one the courier
   * no longer lists is retired, and one listed again comes back. Where an area sits is never changed for one already known.
   */
  async refresh(
    tx: Transaction,
    courierKey: CourierKey,
    listed: { added: MatchedCourierArea[]; kept: ListedCourierArea[] },
    now: Date,
  ): Promise<CourierAreaRefreshCounts> {
    const counts: CourierAreaRefreshCounts = { added: 0, renamed: 0, retired: 0, back: 0 };
    const known = new Map((await this.allOf(tx, courierKey)).map((row) => [row.areaCode, row]));
    if (listed.added.length > 0) {
      const values: NewCourierArea[] = listed.added.map((area) => ({
        courierKey,
        areaCode: area.areaCode,
        name: area.name,
        districtName: area.districtName,
        postCode: area.postCode,
        zillaId: area.zillaId,
        thanaId: area.thanaId,
        suggestedThanaId: area.suggestedThanaId,
        match: area.match,
        refreshedAt: now,
      }));
      for (let start = 0; start < values.length; start += 500) {
        await tx
          .insert(courierAreas)
          .values(values.slice(start, start + 500))
          .onConflictDoNothing();
      }
      counts.added = values.length;
    }
    const seen = new Set<string>(listed.added.map((area) => area.areaCode));
    for (const area of listed.kept) {
      seen.add(area.areaCode);
      const row = known.get(area.areaCode);
      if (!row) continue;
      const renamed = row.name !== area.name || row.districtName !== area.districtName;
      const back = row.retiredAt !== null;
      await tx
        .update(courierAreas)
        .set({
          name: area.name,
          districtName: area.districtName,
          postCode: area.postCode,
          retiredAt: null,
          refreshedAt: now,
          ...(renamed || back ? { updatedAt: now } : {}),
        })
        .where(eq(courierAreas.id, row.id));
      if (renamed) counts.renamed += 1;
      if (back) counts.back += 1;
    }
    const gone = [...known.values()].filter(
      (row) => !seen.has(row.areaCode) && row.retiredAt === null,
    );
    if (gone.length > 0) {
      await tx
        .update(courierAreas)
        .set({ retiredAt: now, updatedAt: now })
        .where(
          inArray(
            courierAreas.id,
            gone.map((row) => row.id),
          ),
        );
      counts.retired = gone.length;
    }
    return counts;
  }

  /** The operator placing an area, or taking it off a thana. Its zilla follows the thana it is placed in. */
  async assign(
    tx: Transaction,
    id: string,
    place: { thanaId: number | null; zillaId: number | null },
    now: Date,
  ): Promise<SelectCourierArea | null> {
    const [row] = await tx
      .update(courierAreas)
      .set({
        thanaId: place.thanaId,
        zillaId: place.zillaId,
        suggestedThanaId: null,
        match: place.thanaId === null ? CourierAreaMatch.None : CourierAreaMatch.Operator,
        updatedAt: now,
      })
      .where(eq(courierAreas.id, id))
      .returning();
    return row ?? null;
  }

  /** Read agreed 2026-11-06: the operator agreeing with suggestions, many at a time; only areas still suggested change. */
  async confirm(tx: Transaction, ids: string[], now: Date): Promise<SelectCourierArea[]> {
    return tx
      .update(courierAreas)
      .set({
        thanaId: sql`${courierAreas.suggestedThanaId}`,
        suggestedThanaId: null,
        match: CourierAreaMatch.Operator,
        updatedAt: now,
      })
      .where(
        and(
          inArray(courierAreas.id, ids),
          eq(courierAreas.match, CourierAreaMatch.Suggested),
          isNotNull(courierAreas.suggestedThanaId),
        ),
      )
      .returning();
  }

  private whereOf(filter: CourierAreaFilter): SQL | undefined {
    const parts: SQL[] = [eq(courierAreas.courierKey, filter.courierKey)];
    if (filter.zillaId !== undefined) parts.push(eq(courierAreas.zillaId, filter.zillaId));
    if (filter.q !== undefined) parts.push(ilike(courierAreas.name, `%${escapeLike(filter.q)}%`));
    switch (filter.state) {
      case CourierAreaState.Retired:
        parts.push(isNotNull(courierAreas.retiredAt));
        break;
      case CourierAreaState.Assigned:
        parts.push(isNull(courierAreas.retiredAt), isNotNull(courierAreas.thanaId));
        break;
      case CourierAreaState.Suggested:
        parts.push(
          isNull(courierAreas.retiredAt),
          eq(courierAreas.match, CourierAreaMatch.Suggested),
        );
        break;
      case CourierAreaState.Unassigned:
        parts.push(isNull(courierAreas.retiredAt), eq(courierAreas.match, CourierAreaMatch.None));
        break;
      case undefined:
        break;
    }
    return and(...parts);
  }
}
