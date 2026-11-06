import type { NewOrderExtraction, Transaction } from '@lytronix/db';

/** PLN-20: an allowance the shop holds now, with the uses it still has. */
export interface AllowanceLeft {
  id: string;
  left: number;
}

/** tenant.order_extractions and the allowances that pay for reads (ORD-34, PLN-20), always in the caller's transaction. */
export interface AddressReadStore {
  /** The shop's address-read allowances that count now, the soonest to end first, locked until the transaction ends. */
  allowancesFor(tx: Transaction, tenantId: string): Promise<AllowanceLeft[]>;
  record(tx: Transaction, read: NewOrderExtraction): Promise<void>;
}
