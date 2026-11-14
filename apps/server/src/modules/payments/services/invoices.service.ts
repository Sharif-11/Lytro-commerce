import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { InvoiceKind, InvoiceLineKind } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import type { InvoicesStore, InvoiceVat, NewInvoiceValues } from '../ports/invoices-store';
import { INVOICES_STORE } from '../tokens';
import type { InvoiceLine, InvoiceRecord } from '../types/invoice';
import { InvoiceTax } from './invoice-tax';

/**
 * BIL-12/13, DAT-07: issues a gap-free numbered invoice and lists a tenant's own. `issue` always joins the
 * caller's own transaction -- the number is taken from the locked counter row in the very same transaction as
 * the plan activation/top-up it documents, so a rolled-back purchase never leaves a numbering gap.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @Inject(INVOICES_STORE) private readonly store: InvoicesStore,
    @Inject(InvoiceTax) private readonly tax: InvoiceTax,
  ) {}

  /**
   * BIL-12, D9-7 (Slice 9.8): the one place an invoice is issued, and so the one place its VAT is worked out -- the VAT
   * Lytro's settings say now for a new invoice, or the VAT of the invoice a credit note takes back.
   */
  async issue(
    tx: Transaction,
    values: NewInvoiceValues,
    lines: readonly InvoiceLine[],
  ): Promise<InvoiceRecord> {
    const vat = await this.vatOf(tx, values);
    // Slice 9.9 (Mushak-6.3): the buyer's address as it stands at issue, so a later move never changes a past invoice.
    const shopAddress =
      values.shopAddress !== undefined
        ? values.shopAddress
        : await this.store.shopAddressOf(tx, values.tenantId);
    const number = await this.store.takeNextNumber(tx);
    return this.store.insert(tx, number, { ...values, shopAddress }, vat, lines);
  }

  /**
   * ADM-15, D8-49: a credit note taking `invoice` back, in the caller's transaction. The invoice stays as it was; the note
   * states the same things, with its amount and VAT negated.
   */
  takeBackWithin(tx: Transaction, invoice: InvoiceRecord): Promise<InvoiceRecord> {
    const amount = fromPaisa(-toPaisa(invoice.amount));
    return this.issue(
      tx,
      {
        tenantId: invoice.tenantId,
        kind: InvoiceKind.CreditNote,
        planSnapshot: invoice.planSnapshot,
        amount,
        creditAmount: '0',
        billingTermLabel: invoice.billingTermLabel,
        shopName: invoice.shopName ?? '',
        ownerName: invoice.ownerName,
        shopAddress: invoice.shopAddress,
        planName: invoice.planName,
        planVersion: invoice.planVersion,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        discountAmount: '0',
        paymentMethod: invoice.paymentMethod ?? 'wallet',
        paymentReference: invoice.paymentReference,
        planPaymentId: null,
        recordedByPlatform: true,
        reversesInvoiceId: invoice.id,
      },
      [
        {
          kind: InvoiceLineKind.Credit,
          description: `Takes back invoice #${String(invoice.number)}`,
          quantity: 1,
          amount,
        },
      ],
    );
  }

  /** D8-49: the invoice a payment produced, in the caller's transaction. */
  findForPaymentWithin(tx: Transaction, planPaymentId: string): Promise<InvoiceRecord | null> {
    return this.store.findForPayment(tx, planPaymentId);
  }

  /** BIL-13: available in every tenant state, even after business-data deletion -- control-schema, no RLS. */
  listForTenant(tenantId: string): Promise<InvoiceRecord[]> {
    return this.store.run((tx) => this.store.listForTenant(tx, tenantId));
  }

  /** BIL-13, LIF-21: a shop's invoices together with its owner's earlier, deleted shops'. */
  listForTenants(tenantIds: string[]): Promise<InvoiceRecord[]> {
    return this.store.run((tx) => this.store.listForTenants(tx, tenantIds));
  }

  async findById(id: string): Promise<InvoiceRecord> {
    const invoice = await this.store.run((tx) => this.store.findById(tx, id));
    if (!invoice) throw new ApiError('not_found', 'InvoiceNotFound', {});
    return invoice;
  }

  private async vatOf(tx: Transaction, values: NewInvoiceValues): Promise<InvoiceVat | null> {
    if (values.kind === InvoiceKind.CreditNote) {
      const reversed = values.reversesInvoiceId
        ? await this.store.findById(tx, values.reversesInvoiceId)
        : null;
      return reversed ? this.tax.takenBack(reversed) : null;
    }
    return this.tax.forNew(values.amount, values.paymentMethod);
  }
}
