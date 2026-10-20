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
  // RTE-01, RTE-03 (2.1): requests a public key may make in any 60 seconds, and requests the shop's keys may make in a
  // billing cycle (a month from the period's start; pay-as-you-go from its creation date).
  requests_per_minute_public: unlimitedInt(),
  requests_monthly: unlimitedInt(),
  // How many days an activity log entry is kept before the retention job purges it (AUD-06). A retention
  // period, not a usage cap -- PLN-19's "unlimited" concept does not apply here, so this stays non-nullable.
  activity_retention_days: z.number().int().positive().optional(),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;

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
