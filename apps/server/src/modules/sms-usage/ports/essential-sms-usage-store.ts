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
  /** SMS-04: holds the shop's free SMS until the transaction ends. */
  holdAllowance(tx: Transaction, tenantId: string): Promise<void>;
  /** Joins the caller's own transaction -- written alongside the SMS send it's counting. Returns the row's ID. */
  record(
    tx: Transaction,
    values: { tenantId: string; kind: SmsKind; units: number },
  ): Promise<string>;
  /** SMS-08: removes what an SMS that never went out took. */
  delete(tx: Transaction, id: string): Promise<void>;
  /** Sum of `units` for the tenant from `since` (inclusive), or every row ever when `since` is null. */
  sumUnitsSince(tenantId: string, since: Date | null): Promise<number>;
  findCycleTenant(tenantId: string): Promise<UsageCycleTenant | null>;
}
