import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  BillingPaymentState,
  InvoiceLineKind,
  PaymentCancelReason,
  PaymentReviewReason,
  PLAN_PAYMENT_METHODS,
  planLimitsSchema,
  PaymentMethod,
} from '@lytronix/validators';

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

// TRM-05: the operator's list says what sits on a term, and whether it can still go.
export const operatorBillingTermSchema = billingTermSchema.extend({
  invoices: z.number(),
  deletable: z.boolean(),
});
export class OperatorBillingTermListDto extends createZodDto(operatorBillingTermSchema.array()) {}

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

// PLN-02, PLN-08: the operator's list says how many shops sit on each version, and whether a plan can still go.
export const operatorPlanSchema = planSchema.extend({
  shopsByVersion: z.array(z.object({ version: z.number(), shops: z.number() })),
  deletable: z.boolean(),
});
export class OperatorPlanListDto extends createZodDto(operatorPlanSchema.array()) {}

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
// The list says who set each one, by email; a single one's reply does not need it.
export class PlanLimitOverrideListDto extends createZodDto(
  planLimitOverrideSchema.extend({ setByEmail: z.string().nullable() }).array(),
) {}

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
  // BIL-19: when the transaction ID was submitted, and the operator's note on a rejection.
  submittedAt: z.coerce.date().nullable(),
  note: z.string().nullable(),
  // BIL-19: on a cancelled request, who closed it -- the shop, or its newer request of the same kind.
  cancelReason: z.nativeEnum(PaymentCancelReason).nullable(),
  createdAt: z.coerce.date(),
});
export class PlanPaymentDto extends createZodDto(planPaymentSchema) {}

// UPG-06: an upgrade's quote, with the period it would run were it confirmed now (UPG-09 starts it at confirmation).
export const upgradeQuoteSchema = planPaymentSchema.extend({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});
export class UpgradeQuoteDto extends createZodDto(upgradeQuoteSchema) {}

// ADM-06: a payment in the operator's queue, with the add-ons it pays for (PLN-14) -- an add-on's own, or those a
// renewal or an upgrade carries -- so the operator sees what the money is for.
export const paymentAddonSchema = z.object({
  id: z.string(),
  key: z.string(),
  labelEn: z.string(),
  labelBn: z.string(),
  quantity: z.number(),
  price: z.string(),
  status: z.string(),
  startsAt: z.date().nullable(),
  expiresAt: z.date(),
});
export const queuedPaymentSchema = planPaymentSchema.extend({
  addons: z.array(paymentAddonSchema),
  shopName: z.string(),
  shopSlug: z.string(),
  // The wallet a receipt says it arrived on: null until one of Lytro's phones has seen the money.
  wallet: z.nativeEnum(PaymentMethod).nullable(),
  // BIL-06 (Slice 5.6, agreed 2026-11-03): what the seller says they sent, what arrived, and why it waits. For the operator
  // only: the shop's own routes never read these.
  amountSent: z.string().nullable(),
  amountArrived: z.string().nullable(),
  reviewReason: z.nativeEnum(PaymentReviewReason).nullable(),
});
export class QueuedPaymentListDto extends createZodDto(queuedPaymentSchema.array()) {}

// BIL-19: a payment as the shop's Billing section lists it -- its state and method, what it names, the add-ons it
// pays for, its invoice once paid, and whether it is the owner's earlier, deleted shop's (LIF-21).
export const billingPaymentSchema = planPaymentSchema.extend({
  state: z.nativeEnum(BillingPaymentState),
  method: z.enum(PLAN_PAYMENT_METHODS).nullable(),
  planName: z.string().nullable(),
  billingTerm: z
    .object({ labelEn: z.string(), labelBn: z.string(), months: z.number() })
    .nullable(),
  invoice: z.object({ id: z.string(), number: z.number() }).nullable(),
  addons: z.array(paymentAddonSchema),
  earlierShop: z.boolean(),
});
export const billingPaymentPageSchema = z.object({
  payments: z.array(billingPaymentSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class BillingPaymentPageDto extends createZodDto(billingPaymentPageSchema) {}

// BIL-01, UPG-03, PLN-14: what each plan would cost the shop now on one term, read without making a payment.
export const billingPriceSchema = z.object({
  planId: z.string(),
  planName: z.string(),
  move: z.enum(['renewal', 'purchase', 'upgrade', 'downgrade']),
  price: z.string(),
  amount: z.string().nullable(),
  credit: z.string().nullable(),
  addons: z.array(
    z.object({
      addonId: z.string(),
      key: z.string(),
      labelEn: z.string(),
      quantity: z.number(),
      amount: z.string(),
    }),
  ),
  blockedBy: z.string().nullable(),
});
export class BillingPriceListDto extends createZodDto(billingPriceSchema.array()) {}

// BIL-12: control.invoices.
export const invoiceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  number: z.number(),
  kind: z.string(),
  // Null on an add-on's own invoice (PLN-14), as are the term label, plan name and version.
  planSnapshot: planLimitsSchema.nullable(),
  amount: z.string(),
  creditAmount: z.string(),
  billingTermLabel: z.string().nullable(),
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
  // BIL-19: the payment it is the receipt of; null on invoices issued before it was recorded.
  planPaymentId: z.string().nullable(),
  issuedAt: z.date(),
  // LIF-21: true for an invoice of the owner's earlier, deleted shop, listed alongside this shop's own.
  earlierShop: z.boolean(),
  // BIL-12, PLN-14: line by line -- the plan, each add-on, an upgrade's credit (negative); none on older invoices.
  lines: z.array(
    z.object({
      kind: z.nativeEnum(InvoiceLineKind),
      description: z.string(),
      quantity: z.number(),
      amount: z.string(),
    }),
  ),
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
