import { Module } from '@nestjs/common';
import {
  DrizzleBalanceLedgerStore,
  DrizzlePlatformWalletsStore,
  DrizzleRateStore,
  DrizzleShopSettingsStore,
} from '../../database/adapters/balance.adapter';
import { DrizzleFeeWaiverStore } from '../../database/adapters/fee-waiver.adapter';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { MailModule } from '../shared/mail/mail.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BalanceService } from './services/balance.service';
import { VerificationFees } from './services/verification-fees';
import { MailLowBalanceNotifier } from './services/mail-low-balance-notifier';
import { PayAsYouGoBillingService } from './services/payg-billing.service';
import { PlatformWalletsService } from './services/platform-wallets.service';
import { RateService } from './services/rate.service';
import { ShopDeliveryRateService } from './services/shop-delivery-rate.service';
import { ShopStorefrontService } from './services/shop-storefront.service';
import { ShopLinkSharing } from './services/shop-link-sharing';
import { TopUpService } from './services/top-up.service';
import { StorefrontActivation } from './services/storefront-activation';
import { FairUseModule } from '../fair-use/fair-use.module';
import { EdgeCacheModule } from '../shared/edge-cache/edge-cache.module';
import {
  BALANCE_LEDGER_STORE,
  CLOCK,
  FEE_WAIVER_STORE,
  LOW_BALANCE_NOTIFIER,
  PLATFORM_WALLETS_STORE,
  RATE_STORE,
  SHOP_SETTINGS_STORE,
} from './tokens';
import { NotificationsModule } from '../notifications/notifications.module';

// D2-8: the balance module. Ledger, rates and per-tenant settings only — no top-up endpoint (that depends on
// control.plan_payments, slice 4) and no plan/billing logic (that's the `billing` module, slice 2 onward).
@Module({
  // StaffModule, MailModule and NotificationsModule are for BAL-13's notice to the owner; none imports this module back.
  imports: [
    TenancyModule,
    AuditModule,
    PaymentsModule,
    PlatformSettingsModule,
    StaffModule,
    MailModule,
    NotificationsModule,
    // PAYG-FAIR-USE-PLAN PF-13, PF-35: the switch, and the purge of a shop's pages as its storefront activates.
    FairUseModule,
    EdgeCacheModule,
  ],
  providers: [
    { provide: BALANCE_LEDGER_STORE, useClass: DrizzleBalanceLedgerStore },
    { provide: RATE_STORE, useClass: DrizzleRateStore },
    { provide: SHOP_SETTINGS_STORE, useClass: DrizzleShopSettingsStore },
    { provide: PLATFORM_WALLETS_STORE, useClass: DrizzlePlatformWalletsStore },
    { provide: LOW_BALANCE_NOTIFIER, useClass: MailLowBalanceNotifier },
    { provide: FEE_WAIVER_STORE, useClass: DrizzleFeeWaiverStore },
    { provide: CLOCK, useValue: (): Date => new Date() },
    BalanceService,
    RateService,
    ShopDeliveryRateService,
    ShopStorefrontService,
    ShopLinkSharing,
    PayAsYouGoBillingService,
    VerificationFees,
    TopUpService,
    PlatformWalletsService,
    StorefrontActivation,
  ],
  exports: [
    BalanceService,
    RateService,
    ShopDeliveryRateService,
    ShopStorefrontService,
    ShopLinkSharing,
    PayAsYouGoBillingService,
    VerificationFees,
    TopUpService,
    PlatformWalletsService,
    StorefrontActivation,
  ],
})
export class BalanceModule {}
