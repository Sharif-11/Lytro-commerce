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

// D2-1: control.plan_payments -- a purchase/renewal/upgrade/top-up quote or submission.
export const planPaymentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  kind: z.string(),
  planId: z.string().nullable(),
  billingTermId: z.string().nullable(),
  amount: z.string(),
  creditAmount: z.string(),
  quotedAt: z.date(),
  status: z.string(),
  senderNumber: z.string().nullable(),
  transactionId: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  verifiedAt: z.date().nullable(),
  createdAt: z.date(),
});
export class PlanPaymentDto extends createZodDto(planPaymentSchema) {}
export class PlanPaymentListDto extends createZodDto(planPaymentSchema.array()) {}

// BIL-12: control.invoices.
export const invoiceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  number: z.number(),
  kind: z.string(),
  planSnapshot: planLimitsSchema,
  amount: z.string(),
  creditAmount: z.string(),
  billingTermLabel: z.string(),
  issuedAt: z.date(),
});
export class InvoiceDto extends createZodDto(invoiceSchema) {}
export class InvoiceListDto extends createZodDto(invoiceSchema.array()) {}

// DWN-01/02: control.scheduled_plan_changes -- the owner's own banner data.
export const scheduledPlanChangeSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  kind: z.string(),
  targetPlanId: z.string().nullable(),
  effectiveAt: z.date(),
  createdAt: z.date(),
});
export class ScheduledPlanChangeDto extends createZodDto(scheduledPlanChangeSchema) {}

// DWN-03: one over-limit item in the downgrade preview.
export const overLimitItemSchema = z.object({
  key: z.string(),
  used: z.number(),
  limit: z.number(),
});
export class OverLimitItemListDto extends createZodDto(overLimitItemSchema.array()) {}
