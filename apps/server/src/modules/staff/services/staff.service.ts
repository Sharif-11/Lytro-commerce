import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { STAFF_STORE } from '../tokens';

export interface StaffStore {
  insertOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void>;
}

/** Staff accounts. The owner is the first user of a shop; more staff come with the staff slice. */
@Injectable()
export class StaffService {
  constructor(@Inject(STAFF_STORE) private readonly store: StaffStore) {}

  createOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void> {
    return this.store.insertOwner(tx, values);
  }
}
