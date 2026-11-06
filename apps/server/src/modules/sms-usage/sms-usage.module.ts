import { Module } from '@nestjs/common';
import { DrizzleEssentialSmsUsageStore } from '../../database/adapters/essential-sms-usage.adapter';
import { DrizzleSmsLogStore } from '../../database/adapters/sms-log.adapter';
import { BalanceModule } from '../balance/balance.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { EssentialSmsUsageService } from './services/essential-sms-usage.service';
import { SmsLog } from './services/sms-log';
import { SmsUnits } from './services/sms-units';
import { ESSENTIAL_SMS_USAGE_STORE, SMS_LOG_STORE } from './tokens';

// AUTH-21, SMS-04 to SMS-09: the shop's free essential-SMS allowance, what it charges past it, and the shop's SMS log.
// Depends only on the usage warnings (LIM-01) and the balance below it, so identity (where a code is counted), shoppers
// and team (where it's read back) can all import it with no cycle.
@Module({
  imports: [UsageWarningsModule, BalanceModule],
  providers: [
    { provide: ESSENTIAL_SMS_USAGE_STORE, useClass: DrizzleEssentialSmsUsageStore },
    { provide: SMS_LOG_STORE, useClass: DrizzleSmsLogStore },
    EssentialSmsUsageService,
    SmsUnits,
    SmsLog,
  ],
  exports: [EssentialSmsUsageService, SmsUnits, SmsLog],
})
export class SmsUsageModule {}
