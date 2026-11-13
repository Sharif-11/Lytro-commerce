import { Module } from '@nestjs/common';
import {
  DrizzleInvoicesStore,
  DrizzlePlanPaymentsStore,
} from '../../database/adapters/payments.adapter';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { InvoiceTax } from './services/invoice-tax';
import { InvoicesService } from './services/invoices.service';
import { PlanPaymentsService } from './services/plan-payments.service';
import { INVOICES_STORE, PLAN_PAYMENTS_STORE } from './tokens';

// D2-1: control.plan_payments and control.invoices, shared by `billing` (purchase/renewal/upgrade) and
// `balance` (top-up) -- kept in its own module so neither of those two has to import the other. The platform settings hold
// Lytro's VAT registration (D9-7), which every invoice reads at issue.
@Module({
  imports: [PlatformSettingsModule],
  providers: [
    { provide: INVOICES_STORE, useClass: DrizzleInvoicesStore },
    { provide: PLAN_PAYMENTS_STORE, useClass: DrizzlePlanPaymentsStore },
    InvoiceTax,
    InvoicesService,
    PlanPaymentsService,
  ],
  exports: [InvoicesService, PlanPaymentsService],
})
export class PaymentsModule {}
