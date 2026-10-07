import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { StaffModule } from '../staff/staff.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ClientIp } from '../../common/client-ip';
import { RolesController } from './controllers/roles.controller';
import { StaffAuthController } from './controllers/staff-auth.controller';
import { StaffSigninService } from './services/staff-signin.service';
import { StaffController } from './controllers/staff.controller';

// The team's HTTP routes. They sit outside the staff module because they need the identity and tenancy gates,
// and tenancy already imports the staff module.
@Module({
  imports: [IdentityModule, TenancyModule, StaffModule],
  controllers: [StaffController, RolesController, StaffAuthController],
  providers: [StaffSigninService, ClientIp],
})
export class TeamModule {}
