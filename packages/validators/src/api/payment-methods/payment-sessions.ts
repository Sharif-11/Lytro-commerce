import { z } from 'zod';
import {
  PAGE_TRANSACTION_ID_MAX_LENGTH,
  PAGE_TRANSACTION_ID_MIN_LENGTH,
  PAYMENT_RETURN_URL_MAX_LENGTH,
} from '../../common/limits';
import { bdMobileNumber } from '../../common/phone';
import { PaymentMethod } from '../../db/enums';
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
    transactionId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]+$/)
      .min(PAGE_TRANSACTION_ID_MIN_LENGTH)
      .max(PAGE_TRANSACTION_ID_MAX_LENGTH)
      .transform((value) => value.toUpperCase()),
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
