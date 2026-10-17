export interface CrossedNotice {
  tenantId: string;
  thresholdPaisa: bigint;
  balanceAfter: string;
}

/** The low-balance notifier used in tests: keeps every crossing notice fired (BAL-13). */
export class LowBalanceCapture {
  readonly notified: CrossedNotice[] = [];

  notifyCrossed(tenantId: string, thresholdPaisa: bigint, balanceAfter: string): Promise<void> {
    this.notified.push({ tenantId, thresholdPaisa, balanceAfter });
    return Promise.resolve();
  }

  forTenant(tenantId: string): CrossedNotice[] {
    return this.notified.filter((n) => n.tenantId === tenantId);
  }
}
