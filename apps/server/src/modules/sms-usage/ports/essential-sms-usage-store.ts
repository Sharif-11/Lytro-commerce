import type { Transaction } from '@lytronix/db';
import type { SmsKind, TenantState } from '@lytronix/validators';

/** What a shop's monthly allowance cycle is counted from (UPG-10, PYG-19). */
export interface UsageCycleTenant {
  state: TenantState;
  periodStart: Date | null;
  createdAt: Date;
}

/** control.essential_sms_usage (AUTH-21). */
export interface EssentialSmsUsageStore {
  /** Joins the caller's own transaction -- written alongside the SMS send it's counting. */
  record(
    tx: Transaction,
    values: { tenantId: string; kind: SmsKind; parts: number },
  ): Promise<void>;
  /** Sum of `parts` for the tenant from `since` (inclusive), or every row ever when `since` is null. */
  sumPartsSince(tenantId: string, since: Date | null): Promise<number>;
  findCycleTenant(tenantId: string): Promise<UsageCycleTenant | null>;
}
