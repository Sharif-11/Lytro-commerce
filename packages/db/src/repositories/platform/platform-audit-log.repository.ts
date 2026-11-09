import { and, desc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { operatorAccounts, platformAuditLog, tenants } from '../../schema';
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

/** ADM-08, D8-11 (Phase 8 Slice 8.4): what the operator's list of the platform audit log filters on. */
export interface AuditListFilters {
  tenantId?: string | undefined;
  actorId?: string | undefined;
  action?: PlatformAuditAction | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  /** Entries older than this id: the page after one that ended on it. */
  before?: number | undefined;
  limit: number;
}

/** An entry as the operator's list shows it, with the operator's email and the shop it was about, if any. */
export interface AuditListRow {
  id: number;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  summary: unknown;
  createdAt: Date;
  shop: { id: string; name: string; slug: string } | null;
}

export class PlatformAuditLogRepository {
  /** ADM-08, D8-11: the entries matching every filter given, newest first, a page at a time. Read only. */
  async list(db: Executor, filters: AuditListFilters): Promise<AuditListRow[]> {
    const where: SQL[] = [];
    if (filters.tenantId) {
      where.push(
        eq(platformAuditLog.targetType, 'tenant'),
        eq(platformAuditLog.targetId, filters.tenantId),
      );
    }
    if (filters.actorId) where.push(eq(platformAuditLog.actorId, filters.actorId));
    if (filters.action) where.push(eq(platformAuditLog.action, filters.action));
    if (filters.from) where.push(gte(platformAuditLog.createdAt, filters.from));
    if (filters.to) where.push(lt(platformAuditLog.createdAt, filters.to));
    if (filters.before) where.push(lt(platformAuditLog.id, filters.before));
    const rows = await db
      .select({
        id: platformAuditLog.id,
        actorType: platformAuditLog.actorType,
        actorId: platformAuditLog.actorId,
        actorEmail: operatorAccounts.email,
        action: platformAuditLog.action,
        targetType: platformAuditLog.targetType,
        targetId: platformAuditLog.targetId,
        result: platformAuditLog.result,
        summary: platformAuditLog.summary,
        createdAt: platformAuditLog.createdAt,
        shopId: tenants.id,
        shopName: tenants.shopName,
        shopSlug: tenants.slug,
      })
      .from(platformAuditLog)
      .leftJoin(operatorAccounts, eq(operatorAccounts.id, platformAuditLog.actorId))
      .leftJoin(
        tenants,
        and(eq(platformAuditLog.targetType, 'tenant'), eq(tenants.id, platformAuditLog.targetId)),
      )
      .where(and(...where))
      .orderBy(desc(platformAuditLog.id))
      .limit(filters.limit);
    return rows.map(({ shopId, shopName, shopSlug, ...entry }) => ({
      ...entry,
      shop:
        shopId !== null && shopName !== null && shopSlug !== null
          ? { id: shopId, name: shopName, slug: shopSlug }
          : null,
    }));
  }

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
