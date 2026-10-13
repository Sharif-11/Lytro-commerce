import { z } from 'zod';

// POST /operator/billing-terms (TRM-01): 0 or 61+ months rejected.
export const createBillingTermSchema = z.object({
  labelBn: z.string().trim().min(1).max(100),
  labelEn: z.string().trim().min(1).max(100),
  months: z.number().int().min(1).max(60),
  visible: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  defaultDiscountPct: z.number().min(0).max(100).optional(),
  // TRM-14: set only for a term visible to exactly one tenant (an enterprise deal).
  tenantId: z.string().uuid().optional(),
});
export type CreateBillingTermInput = z.infer<typeof createBillingTermSchema>;

// PATCH /operator/billing-terms/:id (TRM-11): affects future purchases only; an existing snapshot keeps the
// term as bought, so this never touches anything but the term row itself.
export const updateBillingTermSchema = z.object({
  labelBn: z.string().trim().min(1).max(100).optional(),
  labelEn: z.string().trim().min(1).max(100).optional(),
  months: z.number().int().min(1).max(60).optional(),
  visible: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  defaultDiscountPct: z.number().min(0).max(100).optional(),
});
export type UpdateBillingTermInput = z.infer<typeof updateBillingTermSchema>;
