import { z } from 'zod';
import { calendarDayField } from '../../common/dates';
import {
  LIST_PAGE_SIZE_MAX,
  PAGE_REPORT_NOTE_MAX_LENGTH,
  PAYMENT_NOTE_MAX_LENGTH,
  PAYMENT_PAGE_SIZE,
  PAYMENT_RETURN_URL_MAX_LENGTH,
} from '../../common/limits';
import { bdMobileNumber } from '../../common/phone';
import { transactionIdField } from '../../common/transaction-id';
import {
  PaymentListStatus,
  PaymentMethod,
  PaymentPageReportReason,
  PaymentPageReportStatus,
  PaymentRejectReason,
} from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';

// PAY-04: an address the page sends the shopper back to; its website must be one of the key's (checked on the server).
const returnAddress = z.string().trim().url().max(PAYMENT_RETURN_URL_MAX_LENGTH);

/**
 * PAY-01, SFT-07, LND-10 (Phase 5 Slice 5.2): how a shopper's order that needs an advance is to be paid -- the method
 * chosen at checkout, if any (the page offers every method that is on), and where the page returns the shopper.
 */
export const checkoutPaymentSchema = z
  .object({
    method: z.nativeEnum(PaymentMethod).optional(),
    returnUrl: returnAddress,
    cancelUrl: returnAddress.optional(),
  })
  .strict();
export type CheckoutPaymentInput = z.infer<typeof checkoutPaymentSchema>;

/**
 * PAY-07 (Slice 5.2): what the shopper types on the payment page -- the method they paid by, the transaction ID of
 * [6 to 20] letters and digits, kept in capitals (matched ignoring case, VER-02), and the number they sent it from.
 */
export const paymentSubmissionSchema = z
  .object({
    method: z.nativeEnum(PaymentMethod),
    transactionId: transactionIdField,
    senderNumber: z
      .string()
      .max(30)
      .transform((value, ctx) => {
        const local = bdMobileNumber(value);
        if (local === null) {
          ctx.addIssue({
            code: 'custom',
            message: 'Not a mobile number.',
            params: { problem: FieldProblemCode.InvalidFormat },
          });
          return z.NEVER;
        }
        return local;
      })
      .optional(),
  })
  .strict();
export type PaymentSubmissionInput = z.infer<typeof paymentSubmissionSchema>;

/**
 * PAY-24 (Phase 5 Slice 5.2b, agreed 2026-10-31): a payment link staff make for an order -- for the advance still owed,
 * else what is due; `full` asks for the whole amount due instead.
 */
export const paymentLinkSchema = z.object({ full: z.boolean().optional() }).strict();
export type PaymentLinkInput = z.infer<typeof paymentLinkSchema>;

/** TVR-02 (agreed 2026-10-31): why a shopper reports the payment page, and a note, needed for "something else". */
export const paymentPageReportSchema = z
  .object({
    reason: z.nativeEnum(PaymentPageReportReason),
    note: z.string().trim().max(PAGE_REPORT_NOTE_MAX_LENGTH).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reason === PaymentPageReportReason.Other && !value.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Say what was wrong.',
        params: { problem: FieldProblemCode.Required },
      });
    }
  });
export type PaymentPageReportInput = z.infer<typeof paymentPageReportSchema>;

// ADM-12: the operator's list of page reports, open ones by default.
export const paymentPageReportListSchema = z.object({
  status: z.nativeEnum(PaymentPageReportStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type PaymentPageReportListInput = z.infer<typeof paymentPageReportListSchema>;

/**
 * VER-01, PAY-14 (Phase 5 Slice 5.3, agreed 2026-10-31): staff verify a payment by hand -- for the amount that arrived,
 * the amount asked when left out; never more than the order has due (checked on the server).
 */
export const verifyShopperPaymentSchema = z
  .object({
    amount: z.coerce
      .number()
      .multipleOf(0.01)
      .refine((value) => value > 0, {
        message: 'More than zero.',
        params: { problem: FieldProblemCode.TooSmall },
      })
      .optional(),
  })
  .strict();
export type VerifyShopperPaymentInput = z.infer<typeof verifyShopperPaymentSchema>;

/** PAY-14 (agreed 2026-10-31): why staff reject a payment, shown to the shopper; a note needed for "something else". */
export const rejectShopperPaymentSchema = z
  .object({
    reason: z.nativeEnum(PaymentRejectReason),
    note: z.string().trim().max(PAYMENT_NOTE_MAX_LENGTH).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reason === PaymentRejectReason.Other && !value.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Say what was wrong.',
        params: { problem: FieldProblemCode.Required },
      });
    }
  });
export type RejectShopperPaymentInput = z.infer<typeof rejectShopperPaymentSchema>;

/**
 * PAY-19 (agreed 2026-10-31, one list of every payment): the shop's payments, newest first -- by where each stands, its
 * method and the days it came in (Asia/Dhaka), searched by sender number, transaction ID or order number.
 */
export const paymentListQuerySchema = z.object({
  status: z.nativeEnum(PaymentListStatus).optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  dateFrom: calendarDayField.optional(),
  dateTo: calendarDayField.optional(),
  q: z.string().trim().min(1).max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(PAYMENT_PAGE_SIZE),
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

/** TVR-04 (agreed 2026-10-31): the operator's switch for one shop's new-shop cap -- on, off, or (null) as its kind says. */
export const newShopCapSchema = z.object({ capped: z.boolean().nullable() }).strict();
export type NewShopCapInput = z.infer<typeof newShopCapSchema>;
