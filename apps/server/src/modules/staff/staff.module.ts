import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DrizzleRoleStore } from '../../database/adapters/role.adapter';
import { DrizzleStaffAccounts } from '../../database/adapters/staff-accounts.adapter';
import { DrizzleStaffStore } from '../../database/adapters/staff.adapter';
import { PasswordHasher } from '../identity/services/password-hasher';
import { RoleService } from './services/role.service';
import { StaffService } from './services/staff.service';
import { ROLE_STORE, STAFF_ACCOUNTS, STAFF_PASSWORD_HASHER, STAFF_STORE } from './tokens';

@Module({
  imports: [AuditModule],
  providers: [
    { provide: STAFF_STORE, useClass: DrizzleStaffStore },
    { provide: ROLE_STORE, useClass: DrizzleRoleStore },
    { provide: STAFF_ACCOUNTS, useClass: DrizzleStaffAccounts },
    // The owner's and the staff members' passwords are hashed by the same class, so the rules match.
    { provide: STAFF_PASSWORD_HASHER, useClass: PasswordHasher },
    StaffService,
    RoleService,
  ],
  exports: [StaffService, RoleService],
})
export class StaffModule {}
