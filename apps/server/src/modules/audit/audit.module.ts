import { Module } from '@nestjs/common';
import {
  DrizzleAuditStore,
  DrizzlePlatformAuditStore,
} from '../../database/adapters/audit.adapter';
import { AuditService } from './services/audit.service';
import { PlatformAuditService } from './services/platform-audit.service';
import { AUDIT_STORE, PLATFORM_AUDIT_STORE } from './tokens';

// The activity log's writer (AUD-01 to AUD-08) and the platform audit log's writer (ADM-08, D2-5). A leaf
// module: it imports nothing of its own, so identity, staff, team and balance can all record events without an
// import cycle.
@Module({
  providers: [
    { provide: AUDIT_STORE, useClass: DrizzleAuditStore },
    { provide: PLATFORM_AUDIT_STORE, useClass: DrizzlePlatformAuditStore },
    AuditService,
    PlatformAuditService,
  ],
  exports: [AuditService, PlatformAuditService],
})
export class AuditModule {}
