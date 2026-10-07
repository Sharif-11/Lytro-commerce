import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RolesController } from './controllers/roles.controller';
import { StaffController } from './controllers/staff.controller';

// The team's HTTP routes. They sit outside the staff module because they need the identity and tenancy gates,
// and tenancy already imports the staff module.
@Module({
  imports: [IdentityModule, TenancyModule, StaffModule],
  controllers: [StaffController, RolesController],
})
export class TeamModule {}
