import { Module } from '@nestjs/common';
import { DrizzleStaffStore } from '../../database/adapters/staff.adapter';
import { PasswordHasher } from '../identity/services/password-hasher';
import { StaffService } from './services/staff.service';
import { STAFF_PASSWORD_HASHER, STAFF_STORE } from './tokens';

@Module({
  providers: [
    { provide: STAFF_STORE, useClass: DrizzleStaffStore },
    // The owner's and the staff members' passwords are hashed by the same class, so the rules match.
    { provide: STAFF_PASSWORD_HASHER, useClass: PasswordHasher },
    StaffService,
  ],
  exports: [StaffService],
})
export class StaffModule {}
