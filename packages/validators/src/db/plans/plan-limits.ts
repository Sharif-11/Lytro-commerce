import { z } from 'zod';

// PLN-02, D3: the limits a plan grants, stored as data. Every key is optional because each plan sets its own set;
// the database stores the same shape in `control.plans.limits` and in a shop's plan snapshot.
// PLN-19: each of these (never `activity_retention_days`, a retention period, not a usage cap) is also
// nullable -- `null` means unlimited, `undefined` means "not set, fall back to the consumer's own default",
// a number means capped at that value. Every reader of these fields must branch on `null` explicitly; treating
// it as falsy and falling back to a default would silently turn "unlimited" into "use the default" instead.
const unlimitedInt = () => z.number().int().nonnegative().nullable().optional();

export const planLimitsSchema = z.object({
  products: unlimitedInt(),
  orders_total: unlimitedInt(),
  orders_handled_monthly: unlimitedInt(),
  // Seats, counting the owner: Trial 1 (owner only), Starter 2 (owner plus one staff member). STF-02.
  staff: unlimitedInt(),
  paired_devices: unlimitedInt(),
  storage_mb: unlimitedInt(),
  bandwidth_gb: unlimitedInt(),
  essential_sms_total: unlimitedInt(),
  essential_sms_monthly: unlimitedInt(),
  // RTE-03 (2.1): requests the shop's keys may make in a billing cycle (a month from the period's start; pay-as-you-go
  // from its creation date). A public key has no per-minute figure of its own: one visitor is held by RTE-06, and a
  // shop-wide count would refuse a busy shop's real shoppers (KNOWN-GAPS §82).
  requests_monthly: unlimitedInt(),
  // How many days an activity log entry is kept before the retention job purges it (AUD-06). A retention
  // period, not a usage cap -- PLN-19's "unlimited" concept does not apply here, so this stays non-nullable.
  activity_retention_days: z.number().int().positive().optional(),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;

/** The limits that cap a use (PLN-19): every limit but the activity log's retention period. */
export type UsageLimitKey = Exclude<keyof PlanLimits, 'activity_retention_days'>;

/**
 * PLN-19: what a limit means when a shop's limits do not set it -- a plan an operator made before the limit existed.
 * null is unlimited. The one table every check, the usage page and the purge read, so none has its own fallback.
 */
export const LIMIT_WHEN_UNSET: Readonly<Record<UsageLimitKey, number | null>> = {
  products: null,
  orders_total: null,
  orders_handled_monthly: null,
  // Seats count the owner, so a shop always has the owner's one (STF-02).
  staff: 1,
  // The trial's one listener device (TRL-03).
  paired_devices: 1,
  storage_mb: null,
  bandwidth_gb: null,
  essential_sms_total: null,
  essential_sms_monthly: null,
  // The Trial plan's figure (2.1), until the operator sets the plan's own.
  requests_monthly: 20_000,
};

/** AUD-06: how many days an activity log entry is kept when the shop's limits set no retention period. */
export const ACTIVITY_RETENTION_DAYS_WHEN_UNSET = 30;

/** PLN-19: one limit of a shop as every check applies it: its number, or null for unlimited. */
export function limitOf(limits: PlanLimits | null, key: UsageLimitKey): number | null {
  const value = limits?.[key];
  return value === undefined ? LIMIT_WHEN_UNSET[key] : value;
}

/**
 * PLN-11: a tenant's limits are its plan snapshot with each of its overrides laid over it. The one place that does
 * this, so every reader -- the dashboard, the API's rate limits -- agrees on what a shop may do.
 */
export function withOverrides(
  snapshot: PlanLimits | null,
  overrides: readonly { limitKey: string; value: unknown }[],
): PlanLimits | null {
  if (overrides.length === 0) return snapshot;
  const merged: Record<string, unknown> = { ...(snapshot ?? {}) };
  for (const override of overrides) {
    merged[override.limitKey] = override.value;
  }
  return merged;
}
