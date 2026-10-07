import type { TenantState } from '@lytronix/validators';

/** The shop a staff member signs in to: its id, plan limits and whether it is open for sign-in. */
export interface ShopForSignin {
  id: string;
  planLimits: import('@lytronix/validators').PlanLimits | null;
  state: TenantState;
  suspendedAt: Date | null;
}
