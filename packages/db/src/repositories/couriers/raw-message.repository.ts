import { and, eq, gte, lt, ne } from 'drizzle-orm';
import type { CourierKey, GatewayAnswerAction, RawMessageOutcome } from '@lytronix/validators';
import { courierRawMessages, gatewayAnswers, type SelectCourierRawMessage } from '../../schema';
import type { TransactionRunner, Executor, Transaction } from '../../transactions';

/** DAT-51: a courier's message as it arrived. */
export interface NewCourierRawMessage {
  courierKey: CourierKey;
  body: string;
  headers: Record<string, string>;
}

/** DAT-51: a wallet gateway's answer as it arrived; `tenantId` null for Lytro's own account. */
export interface NewGatewayAnswer {
  tenantId: string | null;
  method: string;
  action: GatewayAnswerAction;
  sessionId: string | null;
  paymentId: string;
  answer: string;
  transactionStatus: string | null;
  receivedAt: Date;
}

/**
 * DAT-51, D9-16 (Phase 9 Slice 9.5): couriers' messages and gateways' answers kept as they arrived, before anything is
 * done with them, and removed past their days.
 */
export class RawMessageRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insertCourier(
    tx: Transaction,
    tenantId: string,
    message: NewCourierRawMessage,
  ): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(courierRawMessages)
      .values({ tenantId, ...message })
      .returning({ id: courierRawMessages.id });
    if (!row) throw new Error('a courier message was not kept');
    return row.id;
  }

  /** What reading it gave: news (with the event it stored, if new), or nothing it could read. */
  async markCourier(
    tx: Transaction,
    tenantId: string,
    id: string,
    outcome: RawMessageOutcome,
    eventId: string | null,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(courierRawMessages)
      .set({ outcome, eventId })
      .where(and(eq(courierRawMessages.tenantId, tenantId), eq(courierRawMessages.id, id)));
  }

  /** DAT-52: the shop's messages in [from, to) that were never read, by when they arrived. */
  async unreadCourier(
    tx: Transaction,
    tenantId: string,
    from: Date,
    to: Date,
    readOutcome: RawMessageOutcome,
  ): Promise<SelectCourierRawMessage[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(courierRawMessages)
      .where(
        and(
          eq(courierRawMessages.tenantId, tenantId),
          ne(courierRawMessages.outcome, readOutcome),
          gte(courierRawMessages.receivedAt, from),
          lt(courierRawMessages.receivedAt, to),
        ),
      )
      .orderBy(courierRawMessages.receivedAt);
  }

  /** DAT-51: the shop's messages past their days, removed. */
  async purgeCourier(tx: Transaction, tenantId: string, before: Date): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const removed = await tx
      .delete(courierRawMessages)
      .where(
        and(eq(courierRawMessages.tenantId, tenantId), lt(courierRawMessages.receivedAt, before)),
      )
      .returning({ id: courierRawMessages.id });
    return removed.length;
  }

  async insertGatewayAnswer(db: Executor, answer: NewGatewayAnswer): Promise<void> {
    await db.insert(gatewayAnswers).values(answer);
  }

  /** DAT-51: every gateway answer past its days, removed. */
  async purgeGatewayAnswers(db: Executor, before: Date): Promise<number> {
    const removed = await db
      .delete(gatewayAnswers)
      .where(lt(gatewayAnswers.receivedAt, before))
      .returning({ id: gatewayAnswers.id });
    return removed.length;
  }
}
