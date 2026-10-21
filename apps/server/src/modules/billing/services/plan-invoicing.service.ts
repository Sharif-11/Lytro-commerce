import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { InvoiceLineKind, type InvoiceKind } from '@lytronix/validators';
import { dhakaDate } from '../../../common/time';
import { InvoicesService } from '../../payments/services/invoices.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import type { InvoiceLine, InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { StaffService } from '../../staff/services/staff.service';
import type { BillingTermRecord } from '../types/billing-term';
import type { PlanRecord } from '../types/plan';
import { BillingTermsService } from './billing-terms.service';

export interface PlanInvoiceInput {
  kind: InvoiceKind;
  payment: PlanPaymentRecord;
  plan: PlanRecord;
  term: BillingTermRecord;
  /** The term's full price before any upgrade credit -- what the discount is measured from. */
  fullPrice: string;
  periodStart: Date;
  periodEnd: Date;
  shopName: string;
}

/**
 * BIL-12, UPG-15: a plan invoice's lines -- the plan at its term's full price, and an upgrade's credit taken off it, so
 * the lines add up to what was paid.
 */
function planLines(input: PlanInvoiceInput): InvoiceLine[] {
  const lines: InvoiceLine[] = [
    {
      kind: InvoiceLineKind.Plan,
      description: `${input.plan.name}, ${input.term.labelEn}`,
      quantity: 1,
      amount: input.fullPrice,
    },
  ];
  if (toPaisa(input.payment.creditAmount) > 0n) {
    lines.push({
      kind: InvoiceLineKind.Credit,
      description: 'Credit for the unused part of the current plan',
      quantity: 1,
      amount: fromPaisa(-toPaisa(input.payment.creditAmount)),
    });
  }
  return lines;
}

/**
 * BIL-05, BIL-12: the plan-activation half both a purchase/renewal and an upgrade share -- the invoice, stating
 * everything BIL-12 lists as it stands right now, and the owner's notice that the plan is active. Both join the
 * activation's own transaction, so a rolled-back activation leaves no invoice and sends nothing.
 */
@Injectable()
export class PlanInvoicingService {
  constructor(
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(BillingTermsService) private readonly terms: BillingTermsService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MessagingService) private readonly sms: MessagingService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async issue(tx: Transaction, input: PlanInvoiceInput): Promise<InvoiceRecord> {
    const { payment, plan, term } = input;
    const owner = await this.staff.ownerContactIn(tx, payment.tenantId);
    const discountAmount = await this.terms.savingFor(
      payment.tenantId,
      plan.id,
      term,
      input.fullPrice,
    );
    const invoice = await this.invoices.issue(
      tx,
      {
        tenantId: payment.tenantId,
        kind: input.kind,
        planSnapshot: plan.limits,
        amount: payment.amount,
        creditAmount: payment.creditAmount,
        billingTermLabel: term.labelEn,
        shopName: input.shopName,
        ownerName: owner?.name ?? null,
        planName: plan.name,
        planVersion: plan.version,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        discountAmount,
        // A wallet payment carries the transaction ID the operator verified; a balance payment has none.
        paymentMethod: payment.transactionId === null ? 'balance' : 'wallet',
        paymentReference: payment.transactionId,
      },
      planLines(input),
    );

    // BIL-05: platform-sent, like every other notice about the owner's own account -- never billed to the shop,
    // never counted toward its free SMS (LIF-10's carve-out).
    const body =
      `Your ${plan.name} plan is active until ${dhakaDate(input.periodEnd)}. ` +
      `Invoice #${String(invoice.number)}, ${invoice.amount} TK.`;
    if (owner?.phone) await this.sms.queueLifecycleNotice(tx, owner.phone, body);
    if (owner?.email) {
      await this.mail.queueLifecycleNotice(tx, owner.email, 'Your plan is active', body);
    }
    return invoice;
  }
}
