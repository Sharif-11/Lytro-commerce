import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorModule } from '../operator/operator.module';
import { BalanceModule } from '../balance/balance.module';
import { BillingModule } from '../billing/billing.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ClientIp } from '../../common/client-ip';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { ActivityController } from './controllers/activity.controller';
import { RolesController } from './controllers/roles.controller';
import { StaffAuthController } from './controllers/staff-auth.controller';
import { BalanceController } from './controllers/balance.controller';
import { OperatorRatesController } from './controllers/operator-rates.controller';
import { OperatorBalanceController } from './controllers/operator-balance.controller';
import { OperatorTenantLifecycleController } from './controllers/operator-tenant-lifecycle.controller';
import { PlansController } from './controllers/plans.controller';
import { OperatorPlansController } from './controllers/operator-plans.controller';
import {
  OperatorBillingTermsController,
  OperatorPlanPricesController,
} from './controllers/operator-billing-terms.controller';
import { OperatorPlanLimitOverridesController } from './controllers/operator-plan-limit-overrides.controller';
import { OperatorPlatformWalletsController } from './controllers/operator-platform-wallets.controller';
import { PlatformWalletsController } from './controllers/platform-wallets.controller';
import { OperatorSettingsController } from './controllers/operator-settings.controller';
import { BillingController } from './controllers/billing.controller';
import { OperatorPaymentQueueController } from './controllers/operator-payment-queue.controller';
import { ShopSettingsController } from './controllers/shop-settings.controller';
import { DataExportController } from './controllers/data-export.controller';
import { DataExportModule } from '../data-export/data-export.module';
import { SmsUsageModule } from '../sms-usage/sms-usage.module';
import { ActivityListService } from './services/activity-list.service';
import { StaffSigninService } from './services/staff-signin.service';
import { ShopSettingsService } from './services/shop-settings.service';
import { StaffController } from './controllers/staff.controller';

// The team's HTTP routes. They sit outside the staff module because they need the identity and tenancy gates,
// and tenancy already imports the staff module. Slice 1's balance/rates routes, and slice 2's plan/term
// routes, landed here too, for the same reason, rather than in their own thin HTTP module -- `billing` itself
// is Phase 2's actual plan/term/invoice logic module (PHASE-2-PLAN.md's architecture table), not an HTTP layer.
@Module({
  imports: [
    IdentityModule,
    TenancyModule,
    StaffModule,
    AuditModule,
    OperatorModule,
    BalanceModule,
    BillingModule,
    PaymentsModule,
    PlatformSettingsModule,
    IdempotencyModule,
    DataExportModule,
    SmsUsageModule,
  ],
  controllers: [
    StaffController,
    RolesController,
    StaffAuthController,
    ActivityController,
    BalanceController,
    OperatorRatesController,
    OperatorBalanceController,
    OperatorTenantLifecycleController,
    PlansController,
    OperatorPlansController,
    OperatorBillingTermsController,
    OperatorPlanPricesController,
    OperatorPlanLimitOverridesController,
    OperatorPlatformWalletsController,
    PlatformWalletsController,
    OperatorSettingsController,
    BillingController,
    OperatorPaymentQueueController,
    ShopSettingsController,
    DataExportController,
  ],
  providers: [StaffSigninService, ActivityListService, ClientIp, ShopSettingsService],
})
export class TeamModule {}
