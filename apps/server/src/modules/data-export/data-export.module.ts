import { Module } from '@nestjs/common';
import { DrizzleDataExportStore } from '../../database/adapters/data-export.adapter';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { StaffModule } from '../staff/staff.module';
import { MailModule } from '../shared/mail/mail.module';
import { QueueModule } from '../shared/queue/queue.module';
import { DataExportService } from './services/data-export.service';
import { DATA_EXPORT_STORE } from './tokens';

// LIF-16/17: the owner's own export of payments and the activity log.
@Module({
  imports: [AuditModule, PaymentsModule, StaffModule, MailModule, QueueModule],
  providers: [{ provide: DATA_EXPORT_STORE, useClass: DrizzleDataExportStore }, DataExportService],
  exports: [DataExportService],
})
export class DataExportModule {}
