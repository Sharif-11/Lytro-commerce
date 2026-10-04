import { Inject, Injectable } from '@nestjs/common';
import { UserRepository, type Transaction } from '@lytronix/db';
import type { StaffStore } from '../../staff/services/staff.service';

/** Database-backed staff store. Runs only inside a transaction, which carries the tenant context. */
@Injectable()
export class DrizzleStaffStore implements StaffStore {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string; name: string },
  ): Promise<void> {
    return this.users.insertOwner(tx, values);
  }
}
