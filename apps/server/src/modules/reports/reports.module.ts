import { Module } from '@nestjs/common';
import {
  DrizzlePaygReportStore,
  DrizzleReportsStore,
  DrizzleShopDayStore,
} from '../../database/adapters/reports.adapter';
import { FairUseModule } from '../fair-use/fair-use.module';
import { PaygReport } from './services/payg-report';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorAuditLog } from './services/operator-audit-log';
import { Reports } from './services/reports';
import { ShopDays } from './services/shop-days';
import { PAYG_REPORT_STORE, REPORTS_CLOCK, REPORTS_STORE, SHOP_DAY_STORE } from './tokens';

// ADM-08, ADM-09, D8-9 to D8-11 (Phase 8 Slice 8.4): the night's record of each shop's day, the operator's reports read
// from it and from Lytro's own tables, and the operator's list of the platform audit log.
@Module({
  imports: [AuditModule, MediaModule, TenancyModule, FairUseModule],
  providers: [
    ShopDays,
    Reports,
    PaygReport,
    { provide: PAYG_REPORT_STORE, useClass: DrizzlePaygReportStore },
    OperatorAuditLog,
    { provide: SHOP_DAY_STORE, useClass: DrizzleShopDayStore },
    { provide: REPORTS_STORE, useClass: DrizzleReportsStore },
    { provide: REPORTS_CLOCK, useValue: () => new Date() },
  ],
  exports: [ShopDays, Reports, OperatorAuditLog, PaygReport],
})
export class ReportsModule {}
