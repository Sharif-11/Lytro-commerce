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
}
