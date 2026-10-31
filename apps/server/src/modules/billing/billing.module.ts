import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { DrizzleAddonsStore } from '../../database/adapters/addons.adapter';
import {
  DrizzleBillingTermsStore,
  DrizzlePlanAssignmentsStore,
  DrizzlePlanLimitOverridesStore,
  DrizzlePlansStore,
  DrizzleScheduledPlanChangesStore,
} from '../../database/adapters/billing.adapter';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DataExportModule } from '../data-export/data-export.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MediaModule } from '../media/media.module';
import { BrandModule } from '../brand/brand.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { DomainsModule } from '../domains/domains.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { OrdersModule } from '../orders/orders.module';
import { ShoppersModule } from '../shoppers/shoppers.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { MailModule } from '../shared/mail/mail.module';
import { MessagingModule } from '../shared/messaging/messaging.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PlansService } from './services/plans.service';
import { AddonCatalogueService } from './services/addon-catalogue.service';
import { AddonLifecycleService } from './services/addon-lifecycle.service';
import { AddonPackService } from './services/addon-pack.service';
import { AddonPurchaseService } from './services/addon-purchase.service';
import { AddonRenewalService } from './services/addon-renewal.service';
import { BillingPricesService } from './services/billing-prices.service';
import { BillingTermsService } from './services/billing-terms.service';
import { DowngradeService } from './services/downgrade.service';
import { LifecycleService } from './services/lifecycle.service';
import { PlanAssignmentService } from './services/plan-assignment.service';
import { PlanLimitOverridesService } from './services/plan-limit-overrides.service';
import { PaymentCancellationService } from './services/payment-cancellation.service';
import { PaymentQueueService } from './services/payment-queue.service';
import { PlanInvoicingService } from './services/plan-invoicing.service';
import { PurchaseService } from './services/purchase.service';
import { ShopLimitsService } from './services/shop-limits.service';
import { TrialLifecycleService } from './services/trial-lifecycle.service';
import { UpgradeService } from './services/upgrade.service';
import {
  ADDONS_STORE,
  BILLING_TERMS_STORE,
  CLOCK,
  PLAN_ASSIGNMENTS_STORE,
  PLAN_LIMIT_OVERRIDES_STORE,
  PLANS_STORE,
  SCHEDULED_PLAN_CHANGES_STORE,
} from './tokens';

// D2-8: the billing module -- plan/term CRUD, versioning, not-for-sale assignment, per-tenant limit overrides
// (PLN-01 to PLN-12, PLN-16 to PLN-18, TRM-01 to TRM-16). API-only this slice (D2-9's resolution): no screens,
// no shell -- every UI piece is slice 8.
@Module({
  imports: [
    TenancyModule,
    AuditModule,
    BalanceModule,
    DataExportModule,
    PaymentsModule,
    MessagingModule,
    MailModule,
    PlatformSettingsModule,
    // LIF-19: the day-60 deletion removes the shop's purchases, stock, orders and customers, catalogue, media, delivery
    // zones, API keys and usage warnings too, and its own domain.
    PurchasingModule,
    InventoryModule,
    OrdersModule,
    ShoppersModule,
    IdempotencyModule,
    CatalogueModule,
    DeliveryModule,
    PublicApiModule,
    MediaModule,
    UsageWarningsModule,
    BrandModule,
    PaymentMethodsModule,
    DomainsModule,
  ],
  providers: [
    { provide: PLANS_STORE, useClass: DrizzlePlansStore },
    { provide: BILLING_TERMS_STORE, useClass: DrizzleBillingTermsStore },
    { provide: PLAN_ASSIGNMENTS_STORE, useClass: DrizzlePlanAssignmentsStore },
    { provide: PLAN_LIMIT_OVERRIDES_STORE, useClass: DrizzlePlanLimitOverridesStore },
    { provide: SCHEDULED_PLAN_CHANGES_STORE, useClass: DrizzleScheduledPlanChangesStore },
    { provide: ADDONS_STORE, useClass: DrizzleAddonsStore },
    { provide: CLOCK, useValue: (): Date => new Date() },
    PlansService,
    BillingTermsService,
    PlanAssignmentService,
    PlanLimitOverridesService,
    ShopLimitsService,
    AddonCatalogueService,
    AddonPurchaseService,
    AddonRenewalService,
    AddonLifecycleService,
    AddonPackService,
    TrialLifecycleService,
    PlanInvoicingService,
    PurchaseService,
    UpgradeService,
    DowngradeService,
    LifecycleService,
    PaymentQueueService,
    PaymentCancellationService,
    BillingPricesService,
  ],
  exports: [
    PlansService,
    BillingTermsService,
    PlanAssignmentService,
    PlanLimitOverridesService,
    ShopLimitsService,
    AddonCatalogueService,
    AddonPurchaseService,
    AddonLifecycleService,
    AddonPackService,
    TrialLifecycleService,
    PurchaseService,
    UpgradeService,
    DowngradeService,
    LifecycleService,
    PaymentQueueService,
    AddonRenewalService,
    PaymentCancellationService,
    BillingPricesService,
  ],
})
export class BillingModule {}
