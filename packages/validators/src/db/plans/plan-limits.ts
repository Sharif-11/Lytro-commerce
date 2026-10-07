import { z } from 'zod';

// PLN-02, D3: the limits a plan grants, stored as data. Every key is optional because each plan sets its own set;
// the database stores the same shape in `control.plans.limits` and in a shop's plan snapshot.
export const planLimitsSchema = z.object({
  products: z.number().int().nonnegative().optional(),
  orders_total: z.number().int().nonnegative().optional(),
  orders_handled_monthly: z.number().int().nonnegative().optional(),
  // Seats, counting the owner: Trial 1 (owner only), Starter 2 (owner plus one staff member). STF-02.
  staff: z.number().int().nonnegative().optional(),
  paired_devices: z.number().int().nonnegative().optional(),
  storage_mb: z.number().int().nonnegative().optional(),
  bandwidth_gb: z.number().int().nonnegative().optional(),
  essential_sms_total: z.number().int().nonnegative().optional(),
  essential_sms_monthly: z.number().int().nonnegative().optional(),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;
