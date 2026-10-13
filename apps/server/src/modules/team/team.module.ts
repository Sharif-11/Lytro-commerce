import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorModule } from '../operator/operator.module';
import { BalanceModule } from '../balance/balance.module';
import { ClientIp } from '../../common/client-ip';
import { ActivityController } from './controllers/activity.controller';
import { RolesController } from './controllers/roles.controller';
import { StaffAuthController } from './controllers/staff-auth.controller';
import { BalanceController } from './controllers/balance.controller';
import { OperatorRatesController } from './controllers/operator-rates.controller';
import { OperatorBalanceController } from './controllers/operator-balance.controller';
import { ActivityListService } from './services/activity-list.service';
import { StaffSigninService } from './services/staff-signin.service';
import { StaffController } from './controllers/staff.controller';

// The team's HTTP routes. They sit outside the staff module because they need the identity and tenancy gates,
// and tenancy already imports the staff module. Slice 1's balance/rates routes landed here too, for the same
// reason, rather than in their own module named `billing` -- that name is reserved for Phase 2's actual
// plan/term/invoice logic module (PHASE-2-PLAN.md's architecture table), not a thin HTTP layer.
@Module({
  imports: [IdentityModule, TenancyModule, StaffModule, AuditModule, OperatorModule, BalanceModule],
  controllers: [
    StaffController,
    RolesController,
    StaffAuthController,
    ActivityController,
    BalanceController,
    OperatorRatesController,
    OperatorBalanceController,
  ],
  providers: [StaffSigninService, ActivityListService, ClientIp],
})
export class TeamModule {}
