import { Module } from '@nestjs/common';
import { DrizzleUsageNoticeStore } from '../../database/adapters/usage-notices.adapter';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { MediaModule } from '../media/media.module';
import { OrdersModule } from '../orders/orders.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { MailModule } from '../shared/mail/mail.module';
import { MessagingModule } from '../shared/messaging/messaging.module';
import { SmsUsageModule } from '../sms-usage/sms-usage.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { UsageNoticeSender } from './services/usage-notice-sender';
import { UsageService } from './services/usage.service';
import { UsageSuggestions } from './services/usage-suggestions';
import { USAGE_NOTICE_CLOCK, USAGE_NOTICE_STORE } from './tokens';

// LIM-01, LIM-02, D3: the shop's usage against its limits, gathered from the modules that count each metric, what
// would give it room (plans from billing), and the writing and sending of the notices the usage warnings queue.
// Nothing imports this module back, so each of them stays free to be read here.
@Module({
  imports: [
    CatalogueModule,
    StaffModule,
    MediaModule,
    OrdersModule,
    PublicApiModule,
    SmsUsageModule,
    BillingModule,
    TenancyModule,
    UsageWarningsModule,
    MailModule,
    MessagingModule,
    AuditModule,
  ],
  providers: [
    { provide: USAGE_NOTICE_STORE, useClass: DrizzleUsageNoticeStore },
    { provide: USAGE_NOTICE_CLOCK, useValue: (): Date => new Date() },
    UsageService,
    UsageSuggestions,
    UsageNoticeSender,
  ],
  exports: [UsageService, UsageNoticeSender],
})
export class UsageModule {}
