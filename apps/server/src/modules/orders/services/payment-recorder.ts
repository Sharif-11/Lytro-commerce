import { Inject, Injectable } from '@nestjs/common';
import type { NewOrderHistory, OrderPatch, Transaction } from '@lytronix/db';
import {
  AuditAction,
  OrderHistoryField,
  OrderPaymentStatus,
  ServerFieldProblemCode,
  StatusOverride,
  type OrderPaymentInput,
  type PaymentMethod,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';
import type { OrderPaymentRecord, OrderRecord } from '../types/orders';

/** A payment as it is recorded: by staff (ORD-15, ORD-22), or the cash on delivery collected (ORD-43). */
export interface PaymentEntry {
  method: PaymentMethod;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
}

/** What an order's payments make of it (ORD-06, ORD-43). */
type PaymentStanding = Pick<OrderRecord, 'due' | 'paymentStatus'>;

/** Money as whole paisa, so a sum of payments never drifts. */
function paisaOf(value: string): number {
  return Math.round(Number(value) * 100);
}

/** An amount as a message says it: whole taka without its paisa. */
function takaText(value: string): string {
  return value.endsWith('.00') ? value.slice(0, -3) : value;
}

/** ORD-06, agreed 2026-10-30: what an order's payments add up to, in paisa -- a voided payment no longer counts. */
function paidOf(payments: readonly OrderPaymentRecord[]): number {
  return payments.reduce(
    (sum, row) => (row.voidedAt === null ? sum + paisaOf(row.amount) : sum),
    0,
  );
}

/** A payment as staff typed it. */
export function paymentEntryOf(input: OrderPaymentInput): PaymentEntry {
  return {
    method: input.method,
    amount: input.amount.toFixed(2),
    senderNumber: input.senderNumber ?? null,
    transactionId: input.transactionId ?? null,
  };
}

/** The history's words for a payment: its amount and method ("500.00 TK bkash"). */
export function paymentWords(payment: Pick<PaymentEntry, 'amount' | 'method'>): string {
  return `${payment.amount} TK ${payment.method.replaceAll('_', ' ')}`;
}

/**
 * ORD-06, ORD-15, ORD-22, ORD-43 (Phase 4 Slice 4.3b, read agreed 2026-10-30): money coming in on an order, in the
 * caller's transaction. A payment staff record is refused on a cancelled order and above what is due, and a
 * transaction ID is the shop's once recorded: refused while another live payment of the shop carries it, or when
 * another shop used it first (control.used_transaction_ids); only after this shop voids its payment may the ID be
 * recorded again. The order's due and payment status are worked out from its live payments every time: paid once they
 * meet the grand total (or, on a required-advance order, the advance), partially paid below that, unverified with none.
 */
@Injectable()
export class PaymentRecorder {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /**
   * ORD-15, ORD-22: a payment staff received, verified by `who` as it is recorded, and the order updated with what it
   * leaves due. `field` prefixes the fields a refusal names (`payment.` when it comes with a new order).
   */
  async recordWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    entry: PaymentEntry,
    who: ResolvedActor,
    field = '',
  ): Promise<OrderRecord> {
    if (order.statusOverride === StatusOverride.Cancelled) {
      throw new ApiError('conflict', 'OrderIsCancelled', {});
    }
    const due = paisaOf(order.due);
    if (due <= 0) throw new ApiError('conflict', 'OrderNothingDue', {});
    if (paisaOf(entry.amount) > due) {
      throw new FieldsError(
        [
          {
            field: `${field}amount`,
            problem: ServerFieldProblemCode.OutOfRange,
            messageKey: 'PaymentMoreThanDue',
            params: { due: takaText(order.due) },
          },
        ],
        'conflict',
        { due: order.due },
      );
    }
    if (entry.transactionId !== null) {
      await this.claimWithin(tx, tenantId, entry.transactionId, field);
    }
    const history: NewOrderHistory[] = [];
    let patch: OrderPatch;
    try {
      patch = await this.addWithin(tx, tenantId, order, entry, who, history);
    } catch (error) {
      // Another payment of the shop took the ID at the same moment (migration 0087's live-ID index).
      if (error instanceof UniqueViolation && error.target === 'transactionId') {
        throw this.taken(field);
      }
      throw error;
    }
    const updated = await this.store.updateOrder(tx, tenantId, order.id, patch);
    await this.store.insertHistory(tx, tenantId, history);
    await this.activity.record(
      tx,
      tenantId,
      who,
      AuditAction.OrderPaymentRecorded,
      { type: 'order', id: order.id },
      {
        orderNumber: order.orderNumber,
        method: entry.method,
        amount: entry.amount,
        transactionId: entry.transactionId,
      },
    );
    return updated;
  }

  /**
   * ORD-43: a payment added to the order, verified by `who`, and the order's due and payment status worked out again;
   * the history notes a payment status that moved. The caller saves the patch with its own changes.
   */
  async addWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    entry: PaymentEntry,
    who: ResolvedActor,
    history: NewOrderHistory[],
  ): Promise<OrderPatch> {
    await this.store.insertPayment(tx, tenantId, {
      orderId: order.id,
      ...entry,
      verifiedBy: who.id,
    });
    const standing = await this.standingWithin(tx, tenantId, order, order);
    this.noteStanding(order, standing, paymentWords(entry), who, history);
    return standing;
  }

  /**
   * ORD-06, ORD-43: what the order's live payments make of it at these totals -- what is due and its payment status. A
   * total below what is already paid is refused (agreed 2026-10-30: never more paid than the order comes to).
   */
  async standingWithin(
    tx: Transaction,
    tenantId: string,
    order: OrderRecord,
    totals: Pick<OrderRecord, 'grandTotal' | 'advanceDue'>,
  ): Promise<PaymentStanding> {
    const paid = paidOf(await this.store.listPayments(tx, tenantId, order.id));
    const total = paisaOf(totals.grandTotal);
    if (paid > total) {
      throw new ApiError(
        'conflict',
        'OrderTotalBelowPaid',
        { paid: (paid / 100).toFixed(2) },
        undefined,
        {
          paid: takaText((paid / 100).toFixed(2)),
        },
      );
    }
    const due = ((total - paid) / 100).toFixed(2);
    if (paid === 0) return { due, paymentStatus: OrderPaymentStatus.Unverified };
    const advance = paisaOf(totals.advanceDue);
    if (paid >= total || (advance > 0 && paid >= advance)) {
      return { due, paymentStatus: OrderPaymentStatus.Paid };
    }
    return { due, paymentStatus: OrderPaymentStatus.PartiallyPaid };
  }

  /** ORD-14: the history's line for a payment status that moved, with what moved it. */
  noteStanding(
    order: OrderRecord,
    standing: PaymentStanding,
    note: string | null,
    who: ResolvedActor,
    history: NewOrderHistory[],
  ): void {
    if (standing.paymentStatus === order.paymentStatus) return;
    history.push({
      orderId: order.id,
      field: OrderHistoryField.PaymentStatus,
      oldValue: order.paymentStatus,
      newValue: standing.paymentStatus,
      note,
      changedBy: who.id,
    });
  }

  /**
   * ORD-15, agreed 2026-10-30: the transaction ID registered to this shop, platform-wide, in the payment's transaction.
   * Refused while a live payment of the shop carries it, when another shop used it first, or when it was registered by
   * anything but one of this shop's order payments since voided (its plan payments use the same register, BIL-07).
   */
  private async claimWithin(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
    field: string,
  ): Promise<void> {
    const use = await this.store.transactionUse(tx, tenantId, transactionId);
    if (use === 'live') throw this.taken(field);
    const held = await this.store.claimTransactionId(tx, tenantId, transactionId);
    if (!held.claimed && (held.tenantId !== tenantId || use !== 'voided')) {
      throw this.taken(field);
    }
  }

  private taken(field: string): FieldsError {
    return new FieldsError(
      [
        {
          field: `${field}transactionId`,
          problem: ServerFieldProblemCode.AlreadyUsed,
          messageKey: 'TransactionIdAlreadyUsed',
        },
      ],
      'conflict',
    );
  }
}
