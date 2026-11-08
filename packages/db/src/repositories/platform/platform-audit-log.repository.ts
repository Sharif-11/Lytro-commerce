import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { platformAuditLog, tenants } from '../../schema';
import type { PlatformActorType, PlatformAuditAction, AuditResult } from '@lytronix/validators';

// ADM-08: insert-only (the app role has no UPDATE/DELETE grant on this table — see migration 0001). The first
// writer is the break-glass 2FA reset script (ADM-18); the full operator-action audit trail (ADM-04) is a
// later slice's work, not this one's.

export interface NewPlatformAuditEntry {
  actorType: PlatformActorType;
  actorId: string | null;
  action: PlatformAuditAction;
  targetType: string | null;
  targetId: string | null;
  result: AuditResult;
  ip: string | null;
  summary: unknown;
}

/** A summary as the operator's recent changes read it: a setting or a rate, or why a shop was suspended. */
export interface AuditChangeSummary {
  key?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  // NTC-13 (Slice 7.7): a rate change's history id, kept on its entry from 2026-11-08.
  rateChangeId?: number;
}

export interface RecentAuditEntryRow {
  id: number;
  actorId: string | null;
  action: string;
  summary: AuditChangeSummary | null;
  createdAt: Date;
  shop: { id: string; name: string; slug: string } | null;
}

export class PlatformAuditLogRepository {
  async insert(db: Executor, entry: NewPlatformAuditEntry): Promise<void> {
    await db.insert(platformAuditLog).values(entry);
  }

  /** Who did this to this target last. */
  async latest(
    db: Executor,
    action: PlatformAuditAction,
    targetId: string,
  ): Promise<{ actorId: string | null } | null> {
    const rows = await db
      .select({ actorId: platformAuditLog.actorId })
      .from(platformAuditLog)
      .where(and(eq(platformAuditLog.action, action), eq(platformAuditLog.targetId, targetId)))
      .orderBy(desc(platformAuditLog.id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** The newest entries of these actions, each with the shop it was about, if any. */
  async recent(
    db: Executor,
    actions: readonly PlatformAuditAction[],
    limit: number,
  ): Promise<RecentAuditEntryRow[]> {
    const rows = await db
      .select({
        id: platformAuditLog.id,
        actorId: platformAuditLog.actorId,
        action: platformAuditLog.action,
        summary: platformAuditLog.summary,
        createdAt: platformAuditLog.createdAt,
        shopId: tenants.id,
        shopName: tenants.shopName,
        shopSlug: tenants.slug,
      })
      .from(platformAuditLog)
      .leftJoin(
        tenants,
        and(eq(platformAuditLog.targetType, 'tenant'), eq(tenants.id, platformAuditLog.targetId)),
      )
      .where(inArray(platformAuditLog.action, [...actions]))
      .orderBy(desc(platformAuditLog.id))
      .limit(limit);
    return rows.map(({ shopId, shopName, shopSlug, summary, ...entry }) => ({
      ...entry,
      summary: summary as AuditChangeSummary | null,
      shop:
        shopId !== null && shopName !== null && shopSlug !== null
          ? { id: shopId, name: shopName, slug: shopSlug }
          : null,
    }));
  }
}
