import { Module } from '@nestjs/common';
import { DrizzleEssentialSmsUsageStore } from '../../database/adapters/essential-sms-usage.adapter';
import { EssentialSmsUsageService } from './services/essential-sms-usage.service';
import { ESSENTIAL_SMS_USAGE_STORE } from './tokens';

// AUTH-21: the tenant's free essential-SMS allowance usage. A leaf module -- depends on nothing else, so
// identity (where a sign-in code is counted) and team (where it's read back) can both import it with no cycle.
@Module({
  providers: [
    { provide: ESSENTIAL_SMS_USAGE_STORE, useClass: DrizzleEssentialSmsUsageStore },
    EssentialSmsUsageService,
  ],
  exports: [EssentialSmsUsageService],
})
export class SmsUsageModule {}
