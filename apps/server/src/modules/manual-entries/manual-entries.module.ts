import { Module } from '@nestjs/common';
import { DrizzleManualEntriesStore } from '../../database/adapters/manual-entries.adapter';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentEvidenceModule } from '../payment-evidence/payment-evidence.module';
import { PaymentsModule } from '../payments/payments.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ManualEntries } from './services/manual-entries';
import { MANUAL_ENTRIES_CLOCK, MANUAL_ENTRIES_STORE } from './tokens';

// ADM-14, ADM-15 (Phase 8 Slice 8.5): payments recorded by the operator, through the queue's own activation.
@Module({
  imports: [
    AuditModule,
    BalanceModule,
    BillingModule,
    NotificationsModule,
    PaymentEvidenceModule,
    PaymentsModule,
    TenancyModule,
  ],
  providers: [
    ManualEntries,
    { provide: MANUAL_ENTRIES_STORE, useClass: DrizzleManualEntriesStore },
    { provide: MANUAL_ENTRIES_CLOCK, useValue: () => new Date() },
  ],
  exports: [ManualEntries],
})
export class ManualEntriesModule {}
