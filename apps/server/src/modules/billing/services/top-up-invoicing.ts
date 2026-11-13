import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { InvoiceKind, InvoiceLineKind, LedgerEntryType, paidByOf } from '@lytronix/validators';
import { BalanceService } from '../../balance/services/balance.service';
import { InvoicesService } from '../../payments/services/invoices.service';
import type { InvoiceRecord } from '../../payments/types/invoice';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { StaffService } from '../../staff/services/staff.service';
import { TenantService } from '../../tenancy/services/tenant.service';

/**
 * BAL-03, BIL-12 (Phase 9 Slice 9.8, the read 2026-11-13): money that came in for the balance, credited and invoiced together
 * in the caller's transaction -- every path that tops a balance up comes through here, so none can credit without its
 * invoice. The invoice is the seller's receipt now and carries VAT once Lytro is registered (D9-7). Top-ups credited before
 * this release have none.
 */
@Injectable()
export class TopUpInvoicing {
  constructor(
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  /** `amount` of `payment`, a top-up, onto its shop's balance, and the top-up's invoice. */
  async creditWithin(
    tx: Transaction,
    payment: PlanPaymentRecord,
    amount: string,
  ): Promise<InvoiceRecord> {
    await this.balance.credit(tx, {
      tenantId: payment.tenantId,
      type: LedgerEntryType.TopUp,
      amount,
      reference: { planPaymentId: payment.id },
    });
    const shop = await this.tenants.findBillingInfo(tx, payment.tenantId);
    const owner = await this.staff.ownerContactIn(tx, payment.tenantId);
    return this.invoices.issue(
      tx,
      {
        tenantId: payment.tenantId,
        kind: InvoiceKind.TopUp,
        planSnapshot: null,
        amount,
        creditAmount: '0',
        billingTermLabel: null,
        shopName: shop?.shopName ?? '',
        ownerName: owner?.name ?? null,
        planName: null,
        planVersion: null,
        periodStart: null,
        periodEnd: null,
        discountAmount: '0',
        paymentMethod: paidByOf(payment.transactionId, payment.payMethod),
        paymentReference: payment.transactionId,
        planPaymentId: payment.id,
        recordedByPlatform: payment.recordedByPlatform,
      },
      [{ kind: InvoiceLineKind.TopUp, description: 'Balance top-up', quantity: 1, amount }],
    );
  }
}
