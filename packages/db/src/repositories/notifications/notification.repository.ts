import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { NOTICE_LINK_PREFIX, NotificationKind, type Language } from '@lytronix/validators';
import {
  notificationPreferences,
  notifications,
  users,
  type NotificationWords,
  type SelectNotification,
} from '../../schema';
import type { Executor, Transaction, TransactionRunner } from '../../transactions';

export interface NewNotification {
  tenantId: string;
  userId: string;
  kind: NotificationKind;
  words: NotificationWords;
  link: string | null;
}

/** A person a notification goes to, and the language their push is written in (null until they choose, then Bangla). */
export interface NotificationRecipient {
  userId: string;
  language: Language | null;
}

/**
 * NTF-01, NTF-03, NTF-04 (Phase 7 Slice 7.3): each person's notifications in a shop, and the kinds they switched off.
 * Row-level security holds every query to the shop the transaction names.
 */
export class NotificationRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * Who hears a notification (NTF-01, D7-42): the owner, and when it is a permission's, every active staff member whose
   * roles hold it -- less anyone who switched the kind off, when it may be switched off (D7-40).
   */
  async recipients(
    tx: Transaction,
    tenantId: string,
    input: { permission: string | null; kind: NotificationKind; switchable: boolean },
  ): Promise<NotificationRecipient[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ id: string; language: Language | null }>(sql`
      SELECT u.id, u.language FROM tenant.users u
      WHERE u.tenant_id = ${tenantId} AND u.active
        AND (u.is_owner OR (${input.permission}::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM tenant.user_roles ur
          JOIN tenant.roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
          WHERE ur.tenant_id = u.tenant_id AND ur.user_id = u.id AND ${input.permission}::text = ANY(r.permissions)
        )))
        AND (NOT ${input.switchable} OR NOT EXISTS (
          SELECT 1 FROM tenant.notification_preferences p
          WHERE p.tenant_id = u.tenant_id AND p.user_id = u.id AND p.kind = ${input.kind}
        ))
      ORDER BY u.is_owner DESC, u.created_at
    `);
    return result.rows.map((row) => ({ userId: row.id, language: row.language }));
  }

  /**
   * NTF-06 (Slice 7.3): the live shops whose owner signs in with this email, as their notices go to it -- for telling them
   * it bounced. Read from the platform's own tables, so no shop's context is needed.
   */
  async shopsOwnedByEmail(db: Executor, email: string): Promise<string[]> {
    const result = await db.execute<{ id: string }>(sql`
      SELECT t.id FROM control.tenants t
      JOIN control.subscriber_identities i ON i.subscriber_id = t.subscriber_id
      WHERE i.kind = 'email' AND i.value = ${email.trim().toLowerCase()} AND t.deleted_at IS NULL
      ORDER BY t.created_at
    `);
    return result.rows.map((row) => row.id);
  }

  /** The owner's own row in the shop, for an owner's session, which carries no staff ID. */
  async ownerUserId(tx: Transaction, tenantId: string): Promise<string | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isOwner, true)))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async insertMany(
    tx: Transaction,
    tenantId: string,
    rows: readonly NewNotification[],
  ): Promise<{ id: string; userId: string }[]> {
    if (rows.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .insert(notifications)
      .values([...rows])
      .returning({ id: notifications.id, userId: notifications.userId });
  }

  /** NTC-08: a withdrawn notice is gone from the bell at once; its row waits for the nightly clean-up. */
  private readonly notWithdrawn = sql`NOT EXISTS (
    SELECT 1 FROM control.notices gone
    WHERE gone.withdrawn_at IS NOT NULL
      AND ${notifications.kind} = ${NotificationKind.LytroNotice}
      AND ${notifications.link} = ${NOTICE_LINK_PREFIX} || gone.id::text
  )`;

  /** NTF-01: a page of a person's notifications, newest first, older than the one named. */
  async list(
    tx: Transaction,
    tenantId: string,
    userId: string,
    page: { limit: number; before?: string | undefined },
  ): Promise<SelectNotification[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const mine = and(
      eq(notifications.tenantId, tenantId),
      eq(notifications.userId, userId),
      this.notWithdrawn,
    );
    const after = page.before
      ? await tx
          .select({ createdAt: notifications.createdAt, id: notifications.id })
          .from(notifications)
          .where(and(mine, eq(notifications.id, page.before)))
          .limit(1)
      : [];
    const cursor = after[0];
    return tx
      .select()
      .from(notifications)
      .where(
        cursor
          ? and(
              mine,
              or(
                lt(notifications.createdAt, cursor.createdAt),
                and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)),
              ),
            )
          : mine,
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(page.limit);
  }

  /** NTF-01: the badge's count. */
  async unreadCount(tx: Transaction, tenantId: string, userId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          this.notWithdrawn,
        ),
      );
    return rows[0]?.n ?? 0;
  }

  /** NTF-01: marks a person's own notifications read -- these, or all of them. How many changed. */
  async markRead(
    tx: Transaction,
    tenantId: string,
    userId: string,
    which: readonly string[] | 'all',
    at: Date,
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          which === 'all' ? sql`true` : inArray(notifications.id, [...which]),
        ),
      )
      .returning({ id: notifications.id });
    return rows.length;
  }

  /** NTF-02: a notification and its person's language, for its push. */
  async findForPush(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<{ notification: SelectNotification; language: Language | null } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ notification: notifications, language: users.language })
      .from(notifications)
      .innerJoin(
        users,
        and(eq(users.tenantId, notifications.tenantId), eq(users.id, notifications.userId)),
      )
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.id, id), this.notWithdrawn))
      .limit(1);
    return rows[0] ?? null;
  }

  /** D7-39: deletes the shop's notifications made before this moment. How many went. */
  async purgeBefore(tx: Transaction, tenantId: string, before: Date): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .delete(notifications)
      .where(and(eq(notifications.tenantId, tenantId), lt(notifications.createdAt, before)))
      .returning({ id: notifications.id });
    return rows.length;
  }

  /** NTF-04: the kinds a person switched off. */
  async offKinds(tx: Transaction, tenantId: string, userId: string): Promise<NotificationKind[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ kind: notificationPreferences.kind })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.tenantId, tenantId),
          eq(notificationPreferences.userId, userId),
        ),
      );
    return rows.map((row) => row.kind);
  }

  /** NTF-04: the whole list of kinds a person has switched off, replacing what was there. */
  async setOff(
    tx: Transaction,
    tenantId: string,
    userId: string,
    kinds: readonly NotificationKind[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.tenantId, tenantId),
          eq(notificationPreferences.userId, userId),
        ),
      );
    if (kinds.length === 0) return;
    await tx
      .insert(notificationPreferences)
      .values([...new Set(kinds)].map((kind) => ({ tenantId, userId, kind })));
  }
}
