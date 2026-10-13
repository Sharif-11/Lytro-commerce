/**
 * BAL-13: notifies a tenant once per crossing of a low-balance threshold. Real in-app/push/email delivery is
 * NTF/notification-module work that doesn't exist in code yet — implemented today as a logging stub, the same
 * precedent Phase 1 used for SMS/mail before a real provider existed (D6). Swapping the adapter later changes
 * nothing about when this is called.
 */
export interface LowBalanceNotifier {
  notifyCrossed(tenantId: string, thresholdPaisa: bigint, balanceAfter: string): Promise<void>;
}
