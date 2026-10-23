import { z } from 'zod';
import { BILLING_PAYMENT_PAGE_SIZE, LIST_PAGE_SIZE_MAX } from '../../common/limits';
import { BillingPaymentState, PlanPaymentKind } from '../../db/enums';

// GET /billing/payments (BIL-19): the shop's payments to the platform, newest first, optionally one state or kind.
export const billingPaymentListQuerySchema = z.object({
  state: z.nativeEnum(BillingPaymentState).optional(),
  kind: z.nativeEnum(PlanPaymentKind).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(BILLING_PAYMENT_PAGE_SIZE),
});
export type BillingPaymentListQuery = z.infer<typeof billingPaymentListQuerySchema>;

// GET /billing/prices (BIL-01, UPG-03, PLN-14): what each plan would cost the shop now on one billing term, read
// without making a payment -- the screens show these, and the payment is quoted only when the seller commits.
export const billingPricesQuerySchema = z.object({
  billingTermId: z.string().uuid(),
});
export type BillingPricesQuery = z.infer<typeof billingPricesQuerySchema>;
