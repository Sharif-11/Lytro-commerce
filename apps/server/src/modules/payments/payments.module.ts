import { Module } from '@nestjs/common';
import {
  DrizzleInvoicesStore,
  DrizzlePlanPaymentsStore,
} from '../../database/adapters/payments.adapter';
import { InvoicesService } from './services/invoices.service';
import { PlanPaymentsService } from './services/plan-payments.service';
import { INVOICES_STORE, PLAN_PAYMENTS_STORE } from './tokens';

// D2-1: control.plan_payments and control.invoices, shared by `billing` (purchase/renewal/upgrade) and
// `balance` (top-up) -- kept in its own module so neither of those two has to import the other.
@Module({
  providers: [
    { provide: INVOICES_STORE, useClass: DrizzleInvoicesStore },
    { provide: PLAN_PAYMENTS_STORE, useClass: DrizzlePlanPaymentsStore },
    InvoicesService,
    PlanPaymentsService,
  ],
  exports: [InvoicesService, PlanPaymentsService],
})
export class PaymentsModule {}
