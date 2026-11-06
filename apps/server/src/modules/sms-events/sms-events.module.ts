import { Module } from '@nestjs/common';
import { DrizzleSmsEventStore } from '../../database/adapters/sms-events.adapter';
import { BalanceModule } from '../balance/balance.module';
import { DomainsModule } from '../domains/domains.module';
import { MessagingModule } from '../shared/messaging/messaging.module';
import { SmsUsageModule } from '../sms-usage/sms-usage.module';
import { StaffModule } from '../staff/staff.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { SmsEventSender } from './services/sms-event-sender';
import { SmsHistory } from './services/sms-history';
import { SmsSettingsService } from './services/sms-settings.service';
import { SMS_EVENT_STORE, SMS_EVENTS_CLOCK } from './tokens';

// SMS-01 to SMS-19 (Phase 7 Slice 7.2): a shop's SMS events -- its settings, sending them from their job, and its SMS log
// and report. Orders and payments never import this: they only queue (SmsEventQueueModule), and this reads what it
// needs of an order from the database, so no cycle runs back to them.
@Module({
  imports: [
    BalanceModule,
    DomainsModule,
    MessagingModule,
    SmsUsageModule,
    StaffModule,
    UsageWarningsModule,
  ],
  providers: [
    { provide: SMS_EVENT_STORE, useClass: DrizzleSmsEventStore },
    { provide: SMS_EVENTS_CLOCK, useValue: (): Date => new Date() },
    SmsSettingsService,
    SmsEventSender,
    SmsHistory,
  ],
  exports: [SmsSettingsService, SmsEventSender, SmsHistory],
})
export class SmsEventsModule {}
