import { TenantState } from '@lytronix/validators';

/**
 * TVR-04 (agreed 2026-10-31): whether the new-shop payment cap holds for a shop -- what the operator set for it, or
 * (null) what its kind says: on for a pay-as-you-go shop, off for one on a plan.
 */
export function newShopCapHolds(capped: boolean | null, state: TenantState): boolean {
  return capped ?? state === TenantState.PayAsYouGo;
}
