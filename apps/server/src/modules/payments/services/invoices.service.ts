import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import type { InvoicesStore, NewInvoiceValues } from '../ports/invoices-store';
import { INVOICES_STORE } from '../tokens';
import type { InvoiceRecord } from '../types/invoice';

/**
 * BIL-12/13, DAT-07: issues a gap-free numbered invoice and lists a tenant's own. `issue` always joins the
 * caller's own transaction -- the number is taken from the locked counter row in the very same transaction as
 * the plan activation/top-up it documents, so a rolled-back purchase never leaves a numbering gap.
 */
@Injectable()
export class InvoicesService {
  constructor(@Inject(INVOICES_STORE) private readonly store: InvoicesStore) {}

  async issue(tx: Transaction, values: NewInvoiceValues): Promise<InvoiceRecord> {
    const number = await this.store.takeNextNumber(tx);
    return this.store.insert(tx, number, values);
  }

  /** BIL-13: available in every tenant state, even after business-data deletion -- control-schema, no RLS. */
  listForTenant(tenantId: string): Promise<InvoiceRecord[]> {
    return this.store.run((tx) => this.store.listForTenant(tx, tenantId));
  }

  async findById(id: string): Promise<InvoiceRecord> {
    const invoice = await this.store.run((tx) => this.store.findById(tx, id));
    if (!invoice) throw new ApiError('not_found', 'InvoiceNotFound', {});
    return invoice;
  }
}
