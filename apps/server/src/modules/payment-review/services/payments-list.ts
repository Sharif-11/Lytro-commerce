import { Inject, Injectable } from '@nestjs/common';
import type { PaymentListFilter, PaymentListRow, Transaction } from '@lytronix/db';
import {
  bdMobileNumber,
  ServerFieldProblemCode,
  type PaymentListQuery,
} from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { DAY_MS, dhakaDayStart } from '../../../common/time';
import type { OrderPerson } from '../../orders/types/orders';
import { StaffService } from '../../staff/services/staff.service';
import type { PaymentListStore } from '../ports/payment-list-store';
import { PAYMENT_LIST_STORE } from '../tokens';
import type { PaymentListItem, PaymentPage } from '../types/payment-review';

// PAY-19: the CSV holds at most this many payments; a longer period is downloaded in parts.
const EXPORT_ROWS_MAX = 10_000;

/**
 * PAY-19 (Phase 5 Slice 5.3, agreed 2026-10-31: one list of every payment): the shop's payments for staff with
 * payments:read -- the transaction IDs shoppers typed, to verify or rejected, and the money in on its orders -- newest
 * first, by status, method and the days they came in (Asia/Dhaka), searched by sender number, transaction ID or order
 * number, with how many and how much the filter holds; and the same as a CSV.
 */
@Injectable()
export class PaymentsList {
  constructor(
    @Inject(PAYMENT_LIST_STORE) private readonly store: PaymentListStore,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  list(tenantId: string, query: PaymentListQuery): Promise<PaymentPage> {
    const filter = this.filterOf(query);
    return this.store.run(tenantId, async (tx) => {
      const found = await this.store.list(tx, tenantId, filter, {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      const person = await this.peopleOf(tx, tenantId, found.rows);
      return {
        payments: found.rows.map((row) => this.itemOf(row, person)),
        page: query.page,
        limit: query.limit,
        total: found.total,
        pages: Math.ceil(found.total / query.limit),
        amount: found.amount,
      };
    });
  }

  /** PAY-19: every payment the filter holds, up to the export's limit, for the CSV. */
  exportAll(tenantId: string, query: PaymentListQuery): Promise<PaymentListItem[]> {
    const filter = this.filterOf(query);
    return this.store.run(tenantId, async (tx) => {
      const found = await this.store.list(tx, tenantId, filter, {
        offset: 0,
        limit: EXPORT_ROWS_MAX,
      });
      const person = await this.peopleOf(tx, tenantId, found.rows);
      return found.rows.map((row) => this.itemOf(row, person));
    });
  }

  private filterOf(query: PaymentListQuery): PaymentListFilter {
    const from = query.dateFrom !== undefined ? dhakaDayStart(query.dateFrom) : null;
    const before =
      query.dateTo !== undefined ? new Date(dhakaDayStart(query.dateTo).getTime() + DAY_MS) : null;
    if (from !== null && before !== null && from >= before) {
      throw new FieldsError([
        {
          field: 'dateTo',
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'PeriodEndsBeforeItStarts',
        },
      ]);
    }
    const search =
      query.q !== undefined ? (bdMobileNumber(query.q) ?? query.q.toUpperCase()) : null;
    return { status: query.status, method: query.method, from, before, search };
  }

  private async peopleOf(
    tx: Transaction,
    tenantId: string,
    rows: PaymentListRow[],
  ): Promise<(id: string | null) => OrderPerson | null> {
    const names = await this.staff.namesWithin(
      tx,
      tenantId,
      rows.flatMap((row) => (row.decidedBy !== null ? [row.decidedBy] : [])),
    );
    return (id) => (id === null ? null : { id, name: names.get(id) ?? null });
  }

  private itemOf(
    row: PaymentListRow,
    person: (id: string | null) => OrderPerson | null,
  ): PaymentListItem {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      order: { id: row.orderId, orderNumber: row.orderNumber },
      method: row.method,
      amount: row.amount,
      senderNumber: row.senderNumber,
      transactionId: row.transactionId,
      at: row.at,
      source: row.source,
      verificationLevel: row.verificationLevel,
      decidedBy: person(row.decidedBy),
      decidedAt: row.decidedAt,
      rejectReason: row.rejectReason,
      note: row.note,
    };
  }
}
