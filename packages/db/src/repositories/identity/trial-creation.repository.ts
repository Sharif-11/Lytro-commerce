import { and, count, eq, gt } from 'drizzle-orm';
import { trialCreations } from '../../schema';
import type { Executor } from '../../transactions';

// AUTH-09: trial-creation history by verified identity and client IP. Tx-joined (unlike
// SignupAttemptRepository) so a rolled-back shop-creation attempt never consumes a quota slot.
export class TrialCreationRepository {
  async insert(db: Executor, values: { identityId: string; ip: string | null }): Promise<void> {
    await db.insert(trialCreations).values(values);
  }

  async countByIdentitySince(db: Executor, identityId: string, since: Date): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(trialCreations)
      .where(and(eq(trialCreations.identityId, identityId), gt(trialCreations.createdAt, since)));
    return rows[0]?.total ?? 0;
  }

  async countByIpSince(db: Executor, ip: string, since: Date): Promise<number> {
    const rows = await db
      .select({ total: count() })
      .from(trialCreations)
      .where(and(eq(trialCreations.ip, ip), gt(trialCreations.createdAt, since)));
    return rows[0]?.total ?? 0;
  }
}
