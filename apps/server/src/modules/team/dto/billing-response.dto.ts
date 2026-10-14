import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { planLimitsSchema } from '@lytronix/validators';

export const billingTermSchema = z.object({
  id: z.string(),
  labelBn: z.string(),
  labelEn: z.string(),
  months: z.number(),
  visible: z.boolean(),
  displayOrder: z.number(),
  defaultDiscountPct: z.string().nullable(),
  tenantId: z.string().nullable(),
  retiredAt: z.date().nullable(),
  createdAt: z.date(),
});
export class BillingTermDto extends createZodDto(billingTermSchema) {}
export class BillingTermListDto extends createZodDto(billingTermSchema.array()) {}

export const planPriceSchema = z.object({
  planId: z.string(),
  billingTermId: z.string(),
  price: z.string(),
});
export class PlanPriceListDto extends createZodDto(planPriceSchema.array()) {}

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  rank: z.number(),
  forSale: z.boolean(),
  version: z.number(),
  limits: planLimitsSchema,
  features: z.record(z.string(), z.boolean()),
  createdAt: z.date(),
});
export class PlanDto extends createZodDto(planSchema) {}
export class PlanListDto extends createZodDto(planSchema.array()) {}

export const planVersionSchema = z.object({
  id: z.string(),
  planId: z.string(),
  version: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  rank: z.number(),
  forSale: z.boolean(),
  limits: planLimitsSchema,
  features: z.record(z.string(), z.boolean()),
  recordedAt: z.date(),
});
export class PlanVersionListDto extends createZodDto(planVersionSchema.array()) {}

export const planAssignmentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  planId: z.string(),
  expiry: z.date().nullable(),
  reason: z.string(),
  assignedBy: z.string(),
  assignedAt: z.date(),
});
export class PlanAssignmentDto extends createZodDto(planAssignmentSchema) {}

export const planLimitOverrideSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  limitKey: z.string(),
  value: z.unknown(),
  reason: z.string(),
  setBy: z.string(),
  setAt: z.date(),
});
export class PlanLimitOverrideDto extends createZodDto(planLimitOverrideSchema) {}
export class PlanLimitOverrideListDto extends createZodDto(planLimitOverrideSchema.array()) {}
