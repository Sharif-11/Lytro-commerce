import { toCsv } from '../../../common/csv';
import type { PaymentListItem } from '../types/payment-review';

/** PAY-19, LIF-16: the shop's payments as one CSV, the same for Payments' download and the shop's data export. */
export function paymentsCsv(rows: readonly PaymentListItem[]): string {
  return toCsv(
    rows.map((row) => ({
      at: row.at.toISOString(),
      orderNumber: row.order.orderNumber,
      status: row.status,
      method: row.method,
      amount: row.amount,
      senderNumber: row.senderNumber,
      transactionId: row.transactionId,
      source: row.source,
      verificationLevel: row.verificationLevel,
      decidedBy: row.decidedBy?.name ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      rejectReason: row.rejectReason,
      note: row.note,
    })),
    [
      'at',
      'orderNumber',
      'status',
      'method',
      'amount',
      'senderNumber',
      'transactionId',
      'source',
      'verificationLevel',
      'decidedBy',
      'decidedAt',
      'rejectReason',
      'note',
    ],
  );
}
