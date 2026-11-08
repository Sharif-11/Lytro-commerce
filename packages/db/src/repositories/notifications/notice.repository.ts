import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  NoticeAudienceKind,
  NoticeCategory,
  NoticeSeverity,
  TenantState,
  type NoticeAudience,
  type RateKey,
} from '@lytronix/validators';
import {
  noticeAcknowledgments,
  noticeDeliveries,
  noticeReads,
  notices,
  noticeVersions,
  plans,
  rateHistory,
  tenants,
  type InsertNotice,
  type NoticeSnapshot,
  type SelectNotice,
  type SelectNoticeVersion,
} from '../../schema';
import type { Executor, Transaction } from '../../transactions';
import { escapeLike } from '../like';

/** A shop as a notice's audience reads it (NTC-02): its plan and its state, when it looks. */
export interface NoticeShopFacts {
  tenantId: string;
  planId: string | null;
  state: TenantState;
}

/** Who is looking at the board: the shop, the person, and whether the shop sees urgent notices only (NTC-07). */
export interface NoticeViewer extends NoticeShopFacts {
  userId: string;
  urgentOnly: boolean;
}

/** A notice on a shop's board, with what this person and this shop have done with it. */
export interface NoticeBoardRow {
  notice: SelectNotice;
  readAt: Date | null;
  dismissedAt: Date | null;
  acknowledgedAt: Date | null;
}

export interface NoticeBoardFilter {
  category?: NoticeCategory | undefined;
  q?: string | undefined;
  limit: number;
  offset: number;
}

/** NTC-05, NTC-09: what came of a published notice, across every shop. */
export interface NoticeCounts {
  shops: number;
  people: number;
  reads: number;
  acknowledged: number;
}

export interface NoticeShop {
  tenantId: string;
  slug: string;
  shopName: string;
}

export interface NoticeAcknowledgmentRow extends NoticeShop {
  userId: string;
  acknowledgedAt: Date;
}

export interface RateChangeRow {
  id: number;
  key: RateKey;
  oldValue: string | null;
  newValue: string;
  changedAt: Date;
  noticeId: string | null;
}

/**
 * NTC-01 to NTC-18 (Phase 7 Slice 7.4): Lytro's notices, each shop's reads and acknowledgments of them, and where each
 * was sent. The notices are platform-wide; every read of a shop's own rows names the shop and the person, since these
 * tables sit in `control` (see the schema's note), and nothing here returns another shop's row to a shop.
 */
export class NoticeRepository {
  // --- the board (NTC-02, NTC-03, NTC-04, NTC-07, NTC-11) ---

  /** A page of the board: pinned first, then newest, live and within the months it keeps. */
  async board(
    db: Executor,
    viewer: NoticeViewer,
    filter: NoticeBoardFilter,
    now: Date,
    keptSince: Date,
  ): Promise<NoticeBoardRow[]> {
    const search = filter.q ? `%${escapeLike(filter.q)}%` : null;
    return this.boardQuery(db, viewer)
      .where(
        and(
          this.visible(viewer, now, keptSince),
          filter.category ? eq(notices.category, filter.category) : undefined,
          search
            ? or(
                ilike(notices.titleBn, search),
                ilike(notices.titleEn, search),
                ilike(notices.bodyBn, search),
                ilike(notices.bodyEn, search),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notices.pinned), desc(notices.publishAt), desc(notices.id))
      .limit(filter.limit)
      .offset(filter.offset);
  }

  /** NTC-04, NTC-05, NTC-14: the live notices that ask something of the person -- the banner, the prompt, the countdown, "I understand". */
  async asking(
    db: Executor,
    viewer: NoticeViewer,
    now: Date,
    keptSince: Date,
  ): Promise<NoticeBoardRow[]> {
    return this.boardQuery(db, viewer)
      .where(
        and(
          this.visible(viewer, now, keptSince),
          or(
            inArray(notices.severity, [NoticeSeverity.Urgent, NoticeSeverity.Important]),
            eq(notices.category, NoticeCategory.Maintenance),
            eq(notices.requiresAck, true),
          ),
        ),
      )
      .orderBy(desc(notices.publishAt), desc(notices.id))
      .limit(100);
  }

  /** NTC-03: the badge -- the live notices this person hasn't opened. A closed banner isn't a read. */
  async unreadCount(
    db: Executor,
    viewer: NoticeViewer,
    now: Date,
    keptSince: Date,
  ): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notices)
      .where(
        and(
          this.visible(viewer, now, keptSince),
          notExists(
            db
              .select({ one: sql`1` })
              .from(noticeReads)
              .where(
                and(
                  eq(noticeReads.noticeId, notices.id),
                  eq(noticeReads.tenantId, viewer.tenantId),
                  eq(noticeReads.userId, viewer.userId),
                  isNotNull(noticeReads.readAt),
                ),
              ),
          ),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /** One live notice on this shop's board, or null when it isn't there for it. */
  async findVisible(
    db: Executor,
    viewer: NoticeViewer,
    id: string,
    now: Date,
    keptSince: Date,
  ): Promise<NoticeBoardRow | null> {
    const rows = await this.boardQuery(db, viewer)
      .where(and(eq(notices.id, id), this.visible(viewer, now, keptSince)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** NTC-09: the person opened it. The first time is the one kept. */
  async markRead(
    db: Executor,
    key: { noticeId: string; tenantId: string; userId: string },
    at: Date,
  ): Promise<void> {
    await db
      .insert(noticeReads)
      .values({ ...key, readAt: at })
      .onConflictDoUpdate({
        target: [noticeReads.noticeId, noticeReads.tenantId, noticeReads.userId],
        set: { readAt: sql`coalesce(${noticeReads.readAt}, excluded.read_at)` },
      });
  }

  /** NTC-04: the person closed its banner or its prompt. */
  async markDismissed(
    db: Executor,
    key: { noticeId: string; tenantId: string; userId: string },
    at: Date,
  ): Promise<void> {
    await db
      .insert(noticeReads)
      .values({ ...key, dismissedAt: at })
      .onConflictDoUpdate({
        target: [noticeReads.noticeId, noticeReads.tenantId, noticeReads.userId],
        set: { dismissedAt: sql`coalesce(${noticeReads.dismissedAt}, excluded.dismissed_at)` },
      });
  }

  /** NTC-05: the shop's "I understand", once. The one already given when the shop gave it before. */
  async acknowledge(
    tx: Transaction,
    key: { noticeId: string; tenantId: string; userId: string },
    at: Date,
  ): Promise<{ acknowledgedAt: Date; userId: string; created: boolean }> {
    const inserted = await tx
      .insert(noticeAcknowledgments)
      .values({ ...key, acknowledgedAt: at })
      .onConflictDoNothing()
      .returning({
        acknowledgedAt: noticeAcknowledgments.acknowledgedAt,
        userId: noticeAcknowledgments.userId,
      });
    if (inserted[0]) return { ...inserted[0], created: true };
    const rows = await tx
      .select({
        acknowledgedAt: noticeAcknowledgments.acknowledgedAt,
        userId: noticeAcknowledgments.userId,
      })
      .from(noticeAcknowledgments)
      .where(
        and(
          eq(noticeAcknowledgments.noticeId, key.noticeId),
          eq(noticeAcknowledgments.tenantId, key.tenantId),
        ),
      )
      .limit(1);
    const existing = rows[0];
    if (!existing) throw new Error('An acknowledgment neither written nor found.');
    return { ...existing, created: false };
  }

  // --- the operator (NTC-01, NTC-05, NTC-08, NTC-09, NTC-12, NTC-13) ---

  async create(db: Executor, row: InsertNotice): Promise<SelectNotice> {
    const rows = await db.insert(notices).values(row).returning();
    const created = rows[0];
    if (!created) throw new Error('A notice was not written.');
    return created;
  }

  async findById(db: Executor, id: string): Promise<SelectNotice | null> {
    const rows = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /** The notice, held for an edit or a withdrawal until the transaction ends. */
  async lockById(tx: Transaction, id: string): Promise<SelectNotice | null> {
    const rows = await tx.select().from(notices).where(eq(notices.id, id)).limit(1).for('update');
    return rows[0] ?? null;
  }

  async update(tx: Transaction, id: string, change: Partial<InsertNotice>): Promise<SelectNotice> {
    const rows = await tx.update(notices).set(change).where(eq(notices.id, id)).returning();
    const updated = rows[0];
    if (!updated) throw new Error('A notice was not updated.');
    return updated;
  }

  /** NTC-08: the version an edit replaced. */
  async addVersion(
    tx: Transaction,
    noticeId: string,
    snapshot: NoticeSnapshot,
    editedBy: string,
  ): Promise<void> {
    await tx.insert(noticeVersions).values({ noticeId, snapshot, editedBy });
  }

  async versions(db: Executor, noticeId: string): Promise<SelectNoticeVersion[]> {
    return db
      .select()
      .from(noticeVersions)
      .where(eq(noticeVersions.noticeId, noticeId))
      .orderBy(desc(noticeVersions.createdAt), desc(noticeVersions.id));
  }

  /** Every notice, newest written first, with what came of each (NTC-09). */
  async operatorList(
    db: Executor,
    filter: NoticeBoardFilter,
  ): Promise<{ notice: SelectNotice; counts: NoticeCounts }[]> {
    const search = filter.q ? `%${escapeLike(filter.q)}%` : null;
    const rows = await db
      .select({ notice: notices, ...this.countColumns() })
      .from(notices)
      .where(
        and(
          filter.category ? eq(notices.category, filter.category) : undefined,
          search
            ? or(
                ilike(notices.titleBn, search),
                ilike(notices.titleEn, search),
                ilike(notices.bodyBn, search),
                ilike(notices.bodyEn, search),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notices.createdAt), desc(notices.id))
      .limit(filter.limit)
      .offset(filter.offset);
    return rows.map(({ notice, shops, people, reads, acknowledged }) => ({
      notice,
      counts: { shops, people, reads, acknowledged },
    }));
  }

  async countsOf(db: Executor, id: string): Promise<NoticeCounts> {
    const rows = await db
      .select({ ...this.countColumns() })
      .from(notices)
      .where(eq(notices.id, id))
      .limit(1);
    return rows[0] ?? { shops: 0, people: 0, reads: 0, acknowledged: 0 };
  }

  /** NTC-05: the shops that said "I understand", newest first. */
  async acknowledgments(
    db: Executor,
    noticeId: string,
    limit: number,
  ): Promise<NoticeAcknowledgmentRow[]> {
    return db
      .select({
        tenantId: tenants.id,
        slug: tenants.slug,
        shopName: tenants.shopName,
        userId: noticeAcknowledgments.userId,
        acknowledgedAt: noticeAcknowledgments.acknowledgedAt,
      })
      .from(noticeAcknowledgments)
      .innerJoin(tenants, eq(tenants.id, noticeAcknowledgments.tenantId))
      .where(eq(noticeAcknowledgments.noticeId, noticeId))
      .orderBy(desc(noticeAcknowledgments.acknowledgedAt))
      .limit(limit);
  }

  /**
   * NTC-02, NTC-06, NTC-07: the shops a notice is for now -- not deleted, and not archived unless it is urgent -- less
   * those it was already sent to, or those that already acknowledged it, when asked.
   */
  async audienceShops(
    db: Executor,
    notice: Pick<SelectNotice, 'id' | 'audience' | 'severity'>,
    without: 'delivered' | 'acknowledged' | null,
    limit: number,
  ): Promise<NoticeShop[]> {
    return db
      .select({ tenantId: tenants.id, slug: tenants.slug, shopName: tenants.shopName })
      .from(tenants)
      .where(
        and(
          isNull(tenants.deletedAt),
          ne(tenants.state, TenantState.Deleted),
          notice.severity === NoticeSeverity.Urgent
            ? undefined
            : ne(tenants.state, TenantState.Archived),
          this.audienceOfShops(notice.audience),
          without === 'delivered'
            ? notExists(
                db
                  .select({ one: sql`1` })
                  .from(noticeDeliveries)
                  .where(
                    and(
                      eq(noticeDeliveries.noticeId, notice.id),
                      eq(noticeDeliveries.tenantId, tenants.id),
                    ),
                  ),
              )
            : undefined,
          without === 'acknowledged'
            ? notExists(
                db
                  .select({ one: sql`1` })
                  .from(noticeAcknowledgments)
                  .where(
                    and(
                      eq(noticeAcknowledgments.noticeId, notice.id),
                      eq(noticeAcknowledgments.tenantId, tenants.id),
                    ),
                  ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(tenants.createdAt), asc(tenants.id))
      .limit(limit);
  }

  /** How many shops a notice is for now, less those that already acknowledged it, when asked. */
  async audienceCount(
    db: Executor,
    notice: Pick<SelectNotice, 'id' | 'audience' | 'severity'>,
    without: 'acknowledged' | null,
  ): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(
        and(
          isNull(tenants.deletedAt),
          ne(tenants.state, TenantState.Deleted),
          notice.severity === NoticeSeverity.Urgent
            ? undefined
            : ne(tenants.state, TenantState.Archived),
          this.audienceOfShops(notice.audience),
          without === 'acknowledged'
            ? notExists(
                db
                  .select({ one: sql`1` })
                  .from(noticeAcknowledgments)
                  .where(
                    and(
                      eq(noticeAcknowledgments.noticeId, notice.id),
                      eq(noticeAcknowledgments.tenantId, tenants.id),
                    ),
                  ),
              )
            : undefined,
        ),
      );
    return rows[0]?.count ?? 0;
  }

  /** NTC-13: a rate change, for its template and for the link a published notice writes on it. */
  async rateChange(db: Executor, id: number): Promise<RateChangeRow | null> {
    const rows = await db
      .select({
        id: rateHistory.id,
        key: rateHistory.key,
        oldValue: rateHistory.oldValue,
        newValue: rateHistory.newValue,
        changedAt: rateHistory.changedAt,
        noticeId: rateHistory.noticeId,
      })
      .from(rateHistory)
      .where(eq(rateHistory.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /** NTC-02: whether every plan an audience names exists. */
  async plansExist(db: Executor, planIds: readonly string[]): Promise<boolean> {
    const wanted = [...new Set(planIds)];
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(plans)
      .where(inArray(plans.id, wanted));
    return (rows[0]?.count ?? 0) === wanted.length;
  }

  /** NTC-02: whether the one shop an audience names exists and isn't deleted. */
  async shopExists(db: Executor, tenantId: string): Promise<boolean> {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }

  // --- publishing (NTC-06, NTC-11, NTC-13) ---

  /** The notices whose time has come and that haven't been sent to every shop yet, oldest first. */
  async due(db: Executor, now: Date, limit: number): Promise<SelectNotice[]> {
    return db
      .select()
      .from(notices)
      .where(
        and(
          isNotNull(notices.publishAt),
          lte(notices.publishAt, now),
          isNull(notices.sentAt),
          isNull(notices.withdrawnAt),
        ),
      )
      .orderBy(asc(notices.publishAt), asc(notices.id))
      .limit(limit);
  }

  /**
   * Takes the shop's place in a notice's sending, in the transaction that tells it. False when it was already told: a
   * second run waits on the first's row and then finds it, so a shop is never told twice.
   */
  async claimDelivery(tx: Transaction, noticeId: string, tenantId: string): Promise<boolean> {
    const rows = await tx
      .insert(noticeDeliveries)
      .values({ noticeId, tenantId, people: 0, emailed: false })
      .onConflictDoNothing()
      .returning({ noticeId: noticeDeliveries.noticeId });
    return rows.length > 0;
  }

  async finishDelivery(
    tx: Transaction,
    noticeId: string,
    tenantId: string,
    result: { people: number; emailed: boolean },
  ): Promise<void> {
    await tx
      .update(noticeDeliveries)
      .set(result)
      .where(and(eq(noticeDeliveries.noticeId, noticeId), eq(noticeDeliveries.tenantId, tenantId)));
  }

  async markSent(db: Executor, id: string, at: Date): Promise<void> {
    await db
      .update(notices)
      .set({ sentAt: at })
      .where(and(eq(notices.id, id), isNull(notices.sentAt)));
  }

  /** RAT-09, NTC-13: the rate change says which notice told of it -- the first one published, kept. */
  async linkRateChange(db: Executor, rateChangeId: number, noticeId: string): Promise<void> {
    await db
      .update(rateHistory)
      .set({ noticeId })
      .where(and(eq(rateHistory.id, rateChangeId), isNull(rateHistory.noticeId)));
  }

  // --- the parts the queries share ---

  private boardQuery(db: Executor, viewer: NoticeViewer) {
    return db
      .select({
        notice: notices,
        readAt: noticeReads.readAt,
        dismissedAt: noticeReads.dismissedAt,
        acknowledgedAt: noticeAcknowledgments.acknowledgedAt,
      })
      .from(notices)
      .leftJoin(
        noticeReads,
        and(
          eq(noticeReads.noticeId, notices.id),
          eq(noticeReads.tenantId, viewer.tenantId),
          eq(noticeReads.userId, viewer.userId),
        ),
      )
      .leftJoin(
        noticeAcknowledgments,
        and(
          eq(noticeAcknowledgments.noticeId, notices.id),
          eq(noticeAcknowledgments.tenantId, viewer.tenantId),
        ),
      );
  }

  /** NTC-02, NTC-03, NTC-07, NTC-08, NTC-11: live for this shop -- published, not ended, not withdrawn, kept, for it. */
  private visible(viewer: NoticeViewer, now: Date, keptSince: Date): SQL | undefined {
    return and(
      isNotNull(notices.publishAt),
      lte(notices.publishAt, now),
      gt(notices.publishAt, keptSince),
      isNull(notices.withdrawnAt),
      or(isNull(notices.endsAt), gt(notices.endsAt, now)),
      this.audienceHas(viewer),
      viewer.urgentOnly ? eq(notices.severity, NoticeSeverity.Urgent) : undefined,
    );
  }

  /** NTC-02: whether a notice's audience takes in this shop, read from the shop's plan and state as they are now. */
  private audienceHas(shop: NoticeShopFacts): SQL {
    const kind = sql`${notices.audience}->>'kind'`;
    return sql`(${kind} = ${NoticeAudienceKind.All}
      OR (${kind} = ${NoticeAudienceKind.Plans} AND ${shop.planId}::text IS NOT NULL
        AND ${notices.audience}->'planIds' @> jsonb_build_array(${shop.planId}::text))
      OR (${kind} = ${NoticeAudienceKind.States}
        AND ${notices.audience}->'states' @> jsonb_build_array(${shop.state}::text))
      OR (${kind} = ${NoticeAudienceKind.Tenant} AND ${notices.audience}->>'tenantId' = ${shop.tenantId}::text))`;
  }

  /** NTC-02: the same audience, as a condition on control.tenants. */
  private audienceOfShops(audience: NoticeAudience): SQL | undefined {
    switch (audience.kind) {
      case NoticeAudienceKind.All:
        return undefined;
      case NoticeAudienceKind.Plans:
        return inArray(tenants.planId, audience.planIds);
      case NoticeAudienceKind.States:
        return inArray(tenants.state, audience.states);
      case NoticeAudienceKind.Tenant:
        return eq(tenants.id, audience.tenantId);
    }
  }

  private countColumns() {
    return {
      shops: sql<number>`(SELECT count(*)::int FROM control.notice_deliveries d WHERE d.notice_id = ${notices.id})`,
      people: sql<number>`(SELECT coalesce(sum(d.people), 0)::int FROM control.notice_deliveries d WHERE d.notice_id = ${notices.id})`,
      reads: sql<number>`(SELECT count(*)::int FROM control.notice_reads r WHERE r.notice_id = ${notices.id} AND r.read_at IS NOT NULL)`,
      acknowledged: sql<number>`(SELECT count(*)::int FROM control.notice_acknowledgments a WHERE a.notice_id = ${notices.id})`,
    };
  }
}
