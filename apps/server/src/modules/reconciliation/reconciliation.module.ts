import { Module } from '@nestjs/common';
import { DrizzleReconciliationStore } from '../../database/adapters/reconciliation.adapter';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../shared/mail/mail.module';
import { RawMessagePurge } from './services/raw-message-purge';
import { Reconciliation } from './services/reconciliation';
import { ReconciliationDifferences } from './services/reconciliation-differences';
import { RECONCILIATION_CLOCK, RECONCILIATION_STORE } from './tokens';

// DAT-51, DAT-52, D9-16 (Phase 9 Slice 9.5): the daily money reconciliation, the operator's word on what it found, and the
// nightly removal of couriers' messages and gateways' answers past their days.
@Module({
  imports: [AuditModule, MailModule],
  providers: [
    Reconciliation,
    ReconciliationDifferences,
    RawMessagePurge,
    { provide: RECONCILIATION_STORE, useClass: DrizzleReconciliationStore },
    { provide: RECONCILIATION_CLOCK, useValue: () => new Date() },
  ],
  exports: [Reconciliation, ReconciliationDifferences, RawMessagePurge],
})
export class ReconciliationModule {}
