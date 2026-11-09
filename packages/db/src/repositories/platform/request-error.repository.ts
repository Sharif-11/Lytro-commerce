import { and, count, desc, eq, gte, lt } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { requestErrors } from '../../schema';

/** One server fault as it is kept (D8-3, D8-23): never a message, a body, a phone or a token. */
export interface NewRequestError {
  tenantId: string;
  requestId: string;
  method: string;
  route: string | null;
  status: 500 | 503;
  kind: string;
}

/** One kept fault as the operator's shop page lists it (ADM-03, D8-23). */
export interface RequestErrorRow {
  id: number;
  requestId: string;
  method: string;
  route: string | null;
  status: number;
  kind: string;
  createdAt: Date;
}

// API-27, D8-3 (Phase 8 Slice 8.1): shops' server faults, written as they happen and cleared after their 7 days, and
// read for the operator's shop page (Slice 8.2).
export class RequestErrorRepository {
  async insert(db: Executor, row: NewRequestError): Promise<void> {
    await db.insert(requestErrors).values(row);
  }

  /** ADM-03: how many faults the shop's requests hit since `since`. */
  async countSince(db: Executor, tenantId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(requestErrors)
      .where(and(eq(requestErrors.tenantId, tenantId), gte(requestErrors.createdAt, since)));
    return row?.value ?? 0;
  }

  /** ADM-03: the shop's faults since `since`, newest first, in keyset pages by id (`beforeId` is the last one seen). */
  async latest(
    db: Executor,
    tenantId: string,
    since: Date,
    beforeId: number | null,
    limit: number,
  ): Promise<RequestErrorRow[]> {
    return db
      .select({
        id: requestErrors.id,
        requestId: requestErrors.requestId,
        method: requestErrors.method,
        route: requestErrors.route,
        status: requestErrors.status,
        kind: requestErrors.kind,
        createdAt: requestErrors.createdAt,
      })
      .from(requestErrors)
      .where(
        and(
          eq(requestErrors.tenantId, tenantId),
          gte(requestErrors.createdAt, since),
          beforeId === null ? undefined : lt(requestErrors.id, beforeId),
        ),
      )
      .orderBy(desc(requestErrors.id))
      .limit(limit);
  }

  /** Every row from before `before`; returns how many went. */
  async purgeBefore(db: Executor, before: Date): Promise<number> {
    const gone = await db
      .delete(requestErrors)
      .where(lt(requestErrors.createdAt, before))
      .returning({ id: requestErrors.id });
    return gone.length;
  }
}
