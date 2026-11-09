import type { NewOrderExtraction, Transaction } from '@lytronix/db';

/** PLN-20: an allowance the shop holds now: what it holds, has used and still has, and when it ends (Slice 7.7). */
export interface AllowanceLeft {
  id: string;
  total: number;
  used: number;
  left: number;
  expiresAt: Date;
}

/** tenant.order_extractions and the allowances that pay for reads (ORD-34, PLN-20), always in the caller's transaction. */
export interface AddressReadStore {
  /** LIF-19: the day-60 deletion's step for the shop's reads. */
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
  /** The shop's address-read allowances that count now, the soonest to end first, locked until the transaction ends. */
  allowancesFor(tx: Transaction, tenantId: string): Promise<AllowanceLeft[]>;
  record(tx: Transaction, read: NewOrderExtraction): Promise<void>;
  /** PLN-20 (Slice 7.7): the reads paid from the balance since a moment, and what they cost. */
  paidFromBalanceSince(
    tx: Transaction,
    tenantId: string,
    since: Date,
  ): Promise<{ count: number; cost: string }>;
}
