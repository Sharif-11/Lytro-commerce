import { platformAdEvents } from '../../schema';
import type { Executor } from '../../transactions';

// MKT-04 (the owner, 2026-11-24): Lytro's own once-per-shop ad events, recorded the first time each is queued for Meta.
// Lytro's own table, read and written outside any shop's row-level security.
export class PlatformAdEventRepository {
  /** Records the shop's event, in the caller's transaction; true only the first time, so the event is queued once. */
  async claim(db: Executor, tenantId: string, eventName: string): Promise<boolean> {
    const rows = await db
      .insert(platformAdEvents)
      .values({ tenantId, eventName })
      .onConflictDoNothing()
      .returning({ tenantId: platformAdEvents.tenantId });
    return rows.length > 0;
  }
}
