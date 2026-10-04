import { insertOwnerUser, type Transaction } from '@lytronix/db';
import type { StaffStore } from '../../staff/services/staff.service';

/** Database-backed staff store. Runs only inside a transaction, which carries the tenant context. */
export class DrizzleStaffStore implements StaffStore {
  insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string; name: string },
  ): Promise<void> {
    return insertOwnerUser(tx, values);
  }
}
