import { Module } from '@nestjs/common';
import {
  DrizzleBalanceLedgerStore,
  DrizzleRateStore,
  DrizzleShopSettingsStore,
} from '../../database/adapters/balance.adapter';
import { AuditModule } from '../audit/audit.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ConsoleLowBalanceNotifier } from './services/console-low-balance-notifier';
import { BalanceService } from './services/balance.service';
import { PayAsYouGoBillingService } from './services/payg-billing.service';
import { RateService } from './services/rate.service';
import {
  BALANCE_LEDGER_STORE,
  CLOCK,
  LOW_BALANCE_NOTIFIER,
  RATE_STORE,
  SHOP_SETTINGS_STORE,
} from './tokens';

// D2-8: the balance module. Ledger, rates and per-tenant settings only — no top-up endpoint (that depends on
// control.plan_payments, slice 4) and no plan/billing logic (that's the `billing` module, slice 2 onward).
@Module({
  imports: [TenancyModule, AuditModule],
  providers: [
    { provide: BALANCE_LEDGER_STORE, useClass: DrizzleBalanceLedgerStore },
    { provide: RATE_STORE, useClass: DrizzleRateStore },
    { provide: SHOP_SETTINGS_STORE, useClass: DrizzleShopSettingsStore },
    { provide: LOW_BALANCE_NOTIFIER, useClass: ConsoleLowBalanceNotifier },
    { provide: CLOCK, useValue: (): Date => new Date() },
    BalanceService,
    RateService,
    PayAsYouGoBillingService,
  ],
  exports: [BalanceService, RateService, PayAsYouGoBillingService],
})
export class BalanceModule {}
