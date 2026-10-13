import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { StaffModule } from '../staff/staff.module';
import { OperatorModule } from '../operator/operator.module';
import { BalanceModule } from '../balance/balance.module';
import { BalanceController } from './controllers/balance.controller';
import { OperatorRatesController } from './controllers/operator-rates.controller';
import { OperatorBalanceController } from './controllers/operator-balance.controller';

// The balance/rates HTTP routes (slice 1). Sits outside the balance module for the same reason team sits
// outside staff: these routes need the identity and tenancy dashboard gates, and the operator session gate.
@Module({
  imports: [IdentityModule, TenancyModule, StaffModule, OperatorModule, BalanceModule],
  controllers: [BalanceController, OperatorRatesController, OperatorBalanceController],
})
export class BillingModule {}
