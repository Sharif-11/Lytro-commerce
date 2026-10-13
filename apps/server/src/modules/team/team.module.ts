import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorModule } from '../operator/operator.module';
import { BalanceModule } from '../balance/balance.module';
import { BillingModule } from '../billing/billing.module';
import { ClientIp } from '../../common/client-ip';
import { ActivityController } from './controllers/activity.controller';
import { RolesController } from './controllers/roles.controller';
import { StaffAuthController } from './controllers/staff-auth.controller';
import { BalanceController } from './controllers/balance.controller';
import { OperatorRatesController } from './controllers/operator-rates.controller';
import { OperatorBalanceController } from './controllers/operator-balance.controller';
import { PlansController } from './controllers/plans.controller';
import { OperatorPlansController } from './controllers/operator-plans.controller';
import {
  OperatorBillingTermsController,
  OperatorPlanPricesController,
} from './controllers/operator-billing-terms.controller';
import { OperatorPlanLimitOverridesController } from './controllers/operator-plan-limit-overrides.controller';
import { ActivityListService } from './services/activity-list.service';
import { StaffSigninService } from './services/staff-signin.service';
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
  ],
  controllers: [
    StaffController,
    RolesController,
    StaffAuthController,
    ActivityController,
    BalanceController,
    OperatorRatesController,
    OperatorBalanceController,
    PlansController,
    OperatorPlansController,
    OperatorBillingTermsController,
    OperatorPlanPricesController,
    OperatorPlanLimitOverridesController,
  ],
  providers: [StaffSigninService, ActivityListService, ClientIp],
})
export class TeamModule {}
