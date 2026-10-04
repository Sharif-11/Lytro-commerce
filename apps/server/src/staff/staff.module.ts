import { Module } from '@nestjs/common';
import { DrizzleStaffStore } from '../database/adapters/staff.adapter';
import { StaffService } from './services/staff.service';
import { STAFF_STORE } from './tokens';

@Module({
  providers: [
    {
      provide: STAFF_STORE,
      useFactory: () => new DrizzleStaffStore(),
    },
    StaffService,
  ],
  exports: [StaffService],
})
export class StaffModule {}
