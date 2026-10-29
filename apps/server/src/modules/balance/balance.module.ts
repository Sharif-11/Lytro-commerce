import { Module } from '@nestjs/common';
import {
  DrizzleBalanceLedgerStore,
  DrizzlePlatformWalletsStore,
  DrizzleRateStore,
  DrizzleShopSettingsStore,
} from '../../database/adapters/balance.adapter';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { MailModule } from '../shared/mail/mail.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BalanceService } from './services/balance.service';
import { MailLowBalanceNotifier } from './services/mail-low-balance-notifier';
import { PayAsYouGoBillingService } from './services/payg-billing.service';
import { PlatformWalletsService } from './services/platform-wallets.service';
import { RateService } from './services/rate.service';
import { ShopDeliveryRateService } from './services/shop-delivery-rate.service';
import { ShopStorefrontService } from './services/shop-storefront.service';
import { ShopLinkSharing } from './services/shop-link-sharing';
import { TopUpService } from './services/top-up.service';
import {
  BALANCE_LEDGER_STORE,
  CLOCK,
  LOW_BALANCE_NOTIFIER,
  PLATFORM_WALLETS_STORE,
  RATE_STORE,
  SHOP_SETTINGS_STORE,
} from './tokens';

// D2-8: the balance module. Ledger, rates and per-tenant settings only — no top-up endpoint (that depends on
// control.plan_payments, slice 4) and no plan/billing logic (that's the `billing` module, slice 2 onward).
@Module({
  // StaffModule and MailModule are for BAL-13's notice to the owner; neither imports this module back.
  imports: [
    TenancyModule,
    AuditModule,
    PaymentsModule,
    PlatformSettingsModule,
    StaffModule,
    MailModule,
  ],
  providers: [
    { provide: BALANCE_LEDGER_STORE, useClass: DrizzleBalanceLedgerStore },
    { provide: RATE_STORE, useClass: DrizzleRateStore },
    { provide: SHOP_SETTINGS_STORE, useClass: DrizzleShopSettingsStore },
    { provide: PLATFORM_WALLETS_STORE, useClass: DrizzlePlatformWalletsStore },
    { provide: LOW_BALANCE_NOTIFIER, useClass: MailLowBalanceNotifier },
    { provide: CLOCK, useValue: (): Date => new Date() },
    BalanceService,
    RateService,
    ShopDeliveryRateService,
    ShopStorefrontService,
    ShopLinkSharing,
    PayAsYouGoBillingService,
    TopUpService,
    PlatformWalletsService,
  ],
  exports: [
    BalanceService,
    RateService,
    ShopDeliveryRateService,
    ShopStorefrontService,
    ShopLinkSharing,
    PayAsYouGoBillingService,
    TopUpService,
    PlatformWalletsService,
  ],
})
export class BalanceModule {}
