import { Module } from '@nestjs/common';
import { DrizzleFraudCheckStore } from '../../database/adapters/fraud-checks.adapter';
import { BalanceModule } from '../balance/balance.module';
import { CouriersModule } from '../couriers/couriers.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { FraudChecks } from './services/fraud-checks';
import { FRAUD_CHECK_CLOCK, FRAUD_CHECK_STORE } from './tokens';

// FRD-01 to FRD-08, FRD-11 (Phase 7 Slice 7.5): checking a phone, by staff or on a new cash-on-delivery order, through
// the couriers' own check on the shop's own key and the shop's own orders.
@Module({
  imports: [BalanceModule, CouriersModule, PlatformSettingsModule, TenancyModule],
  providers: [
    { provide: FRAUD_CHECK_STORE, useClass: DrizzleFraudCheckStore },
    { provide: FRAUD_CHECK_CLOCK, useValue: (): Date => new Date() },
    FraudChecks,
  ],
  exports: [FraudChecks],
})
export class FraudChecksModule {}
