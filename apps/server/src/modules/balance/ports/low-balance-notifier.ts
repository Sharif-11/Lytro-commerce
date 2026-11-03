import type { Transaction } from '@lytronix/db';

/**
 * BAL-13: notifies a tenant once per crossing of a low-balance threshold. Joins the transaction of the charge
 * that crossed it, so a rolled-back charge sends nothing.
 */
export interface LowBalanceNotifier {
  notifyCrossed(
    tx: Transaction,
    tenantId: string,
    thresholdPaisa: bigint,
    balanceAfter: string,
  ): Promise<void>;
  /** WAL-21 (Slice 5.4b, agreed 2026-11-02): a matched payment went to staff, the balance being too short for its fee. */
  notifyFeeShort(tx: Transaction, tenantId: string, balance: string): Promise<void>;
}
