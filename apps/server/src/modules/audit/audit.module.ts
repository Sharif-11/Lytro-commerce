import { Module } from '@nestjs/common';
import { DrizzleAuditStore } from '../../database/adapters/audit.adapter';
import { AuditService } from './services/audit.service';
import { AUDIT_STORE } from './tokens';

// The activity log's writer (AUD-01 to AUD-08). A leaf module: it imports nothing of its own, so identity, staff
// and team can all record events without an import cycle.
@Module({
  providers: [{ provide: AUDIT_STORE, useClass: DrizzleAuditStore }, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
