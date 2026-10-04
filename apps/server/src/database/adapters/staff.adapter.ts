import { TransactionRunner, UserRepository, type Transaction } from '@lytronix/db';
import type { StaffStore } from '../../staff/services/staff.service';

/** Database-backed staff store. Runs only inside a transaction, which carries the tenant context. */
export class DrizzleStaffStore implements StaffStore {
  private readonly users = new UserRepository(new TransactionRunner());

  insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string; name: string },
  ): Promise<void> {
    return this.users.insertOwner(tx, values);
  }
}
