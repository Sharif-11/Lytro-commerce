import { and, eq, sql } from 'drizzle-orm';
import { pushSubscriptions, type SelectPushSubscription } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export interface NewPushSubscription {
  tenantId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

/**
 * NTF-02 (Phase 7 Slice 7.3): the browsers each person subscribed to push. A browser subscribing again takes its new keys
 * and starts its failures over.
 */
export class PushSubscriptionRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async upsert(tx: Transaction, row: NewPushSubscription): Promise<void> {
    await this.transactions.setTenantContext(tx, row.tenantId);
    await tx
      .insert(pushSubscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: [pushSubscriptions.tenantId, pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: {
          p256dh: sql`excluded.p256dh`,
          auth: sql`excluded.auth`,
          userAgent: sql`excluded.user_agent`,
          failures: 0,
        },
      });
  }

  /** Whether the person had that browser subscribed. */
  async remove(
    tx: Transaction,
    tenantId: string,
    userId: string,
    endpoint: string,
  ): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.tenantId, tenantId),
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      )
      .returning({ id: pushSubscriptions.id });
    return rows.length > 0;
  }

  async holds(
    tx: Transaction,
    tenantId: string,
    userId: string,
    endpoint: string,
  ): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.tenantId, tenantId),
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async listForUser(
    tx: Transaction,
    tenantId: string,
    userId: string,
  ): Promise<SelectPushSubscription[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.userId, userId)));
  }

  /** The push service said the subscription is gone. */
  async removeById(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.id, id)));
  }

  async markPushed(tx: Transaction, tenantId: string, id: string, at: Date): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(pushSubscriptions)
      .set({ lastPushedAt: at, failures: 0 })
      .where(and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.id, id)));
  }

  async markFailure(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(pushSubscriptions)
      .set({ failures: sql`${pushSubscriptions.failures} + 1` })
      .where(and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.id, id)));
  }
}
