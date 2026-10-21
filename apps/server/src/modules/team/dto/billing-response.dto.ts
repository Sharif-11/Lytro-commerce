import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { PLAN_PAYMENT_METHODS, planLimitsSchema } from '@lytronix/validators';

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

// D2-1: control.plan_payments -- a purchase/renewal/upgrade/top-up quote or submission. `/billing/purchase`,
// `/upgrade/confirm` and `/balance/top-up/confirm` all carry `IdempotencyInterceptor`, which replays a cached
// response by round-tripping it through `control.idempotency_keys`' jsonb column -- a Date instance comes back
// out as a plain ISO string, not a Date, so every date field here must coerce (accept both) or a replayed
// response fails this schema's own validation and 500s on exactly the case idempotency exists to handle.
export const planPaymentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  kind: z.string(),
  planId: z.string().nullable(),
  billingTermId: z.string().nullable(),
  amount: z.string(),
  creditAmount: z.string(),
  quotedAt: z.coerce.date(),
  status: z.string(),
  senderNumber: z.string().nullable(),
  transactionId: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  verifiedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
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
  // BIL-12: null only on invoices issued before these fields existed.
  shopName: z.string().nullable(),
  ownerName: z.string().nullable(),
  planName: z.string().nullable(),
  planVersion: z.number().nullable(),
  periodStart: z.date().nullable(),
  periodEnd: z.date().nullable(),
  discountAmount: z.string(),
  paymentMethod: z.enum(PLAN_PAYMENT_METHODS).nullable(),
  paymentReference: z.string().nullable(),
  issuedAt: z.date(),
  // LIF-21: true for an invoice of the owner's earlier, deleted shop, listed alongside this shop's own.
  earlierShop: z.boolean(),
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

// PYG-01, PYG-10, LIF-15: choosing pay-as-you-go -- scheduled for the paid period's end, or done at once.
export const payAsYouGoChoiceSchema = z.object({
  effective: z.enum(['period_end', 'now']),
  effectiveAt: z.date().nullable(),
});
export class PayAsYouGoChoiceDto extends createZodDto(payAsYouGoChoiceSchema) {}

// LIF-01: null means no cancellation is currently scheduled.
export const cancellationStatusSchema = z.object({
  cancelledAt: z.date().nullable(),
});
export class CancellationStatusDto extends createZodDto(cancellationStatusSchema) {}

// DWN-03: one over-limit item in the downgrade preview.
export const overLimitItemSchema = z.object({
  key: z.string(),
  used: z.number(),
  limit: z.number(),
});
export class OverLimitItemListDto extends createZodDto(overLimitItemSchema.array()) {}

// DWN-12, DWN-14: GET /billing/downgrade/checklist -- null when no downgrade left the shop over a limit, or once its 30
// days have passed with everything fixed.
export const downgradeChecklistSchema = z.object({
  checklist: z
    .object({
      downgradedAt: z.date(),
      endsAt: z.date(),
      items: z.array(overLimitItemSchema.extend({ fixed: z.boolean() })),
      finalWarningAt: z.date().nullable(),
    })
    .nullable(),
});
export class DowngradeChecklistDto extends createZodDto(downgradeChecklistSchema) {}
