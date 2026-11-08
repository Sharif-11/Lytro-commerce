import { lt } from 'drizzle-orm';
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

// API-27, D8-3 (Phase 8 Slice 8.1): shops' server faults, written as they happen and cleared after their 7 days.
// The shop page's reads arrive with Slice 8.2.
export class RequestErrorRepository {
  async insert(db: Executor, row: NewRequestError): Promise<void> {
    await db.insert(requestErrors).values(row);
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
