import type { PaymentListFilter, PaymentListRow, Transaction } from '@lytronix/db';

/** PAY-19 (Slice 5.3): the shop's typed transaction IDs and money in, as one list. */
export interface PaymentListStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(
    tx: Transaction,
    tenantId: string,
    filter: PaymentListFilter,
    page: { offset: number; limit: number } | null,
  ): Promise<{ rows: PaymentListRow[]; total: number; amount: string }>;
}
