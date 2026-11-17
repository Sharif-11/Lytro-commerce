import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  paymentListQuerySchema,
  PaymentListStatus,
  PaymentMethod,
  PaymentRejectReason,
  PaymentReviewReason,
  PaymentSessionSource,
  rejectShopperPaymentSchema,
  VerificationLevel,
  verifyShopperPaymentSchema,
  coercedDateField,
} from '@lytronix/validators';

// VER-01, PAY-14, PAY-19 (Phase 5 Slice 5.3): the shop's payments, verified or rejected by hand.
export class PaymentListQueryDto extends createZodDto(paymentListQuerySchema) {}
export class VerifyShopperPaymentDto extends createZodDto(verifyShopperPaymentSchema) {}
export class RejectShopperPaymentDto extends createZodDto(rejectShopperPaymentSchema) {}

const personSchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();
export const paymentListItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['session', 'payment']),
  status: z.enum(PaymentListStatus),
  order: z.object({ id: z.string(), orderNumber: z.string() }),
  method: z.enum(PaymentMethod),
  amount: z.string(),
  senderNumber: z.string().nullable(),
  transactionId: z.string().nullable(),
  at: coercedDateField(),
  source: z.enum(PaymentSessionSource).nullable(),
  verificationLevel: z.enum(VerificationLevel).nullable(),
  decidedBy: personSchema,
  decidedAt: coercedDateField().nullable(),
  rejectReason: z.enum(PaymentRejectReason).nullable(),
  note: z.string().nullable(),
  test: z.boolean(),
  reviewReason: z.enum(PaymentReviewReason).nullable(),
  receipt: z
    .object({
      amount: z.string(),
      senderNumber: z.string().nullable(),
      receivedAt: coercedDateField(),
    })
    .nullable(),
});
export class PaymentPageDto extends createZodDto(
  z.object({
    payments: z.array(paymentListItemSchema),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
    amount: z.string(),
  }),
) {}
