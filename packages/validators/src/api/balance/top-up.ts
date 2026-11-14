import { z } from 'zod';
import { transactionIdField } from '../../common/transaction-id';
import { evidenceKeyField } from '../billing/payment-evidence';
import { senderNumberField } from '../billing/purchase';

// POST /balance/top-up/quote (BAL-03/04): the amount the tenant wants to top up.
export const quoteTopUpSchema = z.object({
  amount: z.coerce.number().positive(),
});
export type QuoteTopUpInput = z.infer<typeof quoteTopUpSchema>;

// POST /balance/top-up/confirm (BAL-03/16): the wallet transaction ID submission -- a top-up is always a
// wallet payment, never paid from the balance it is itself funding.
export const confirmTopUpSchema = z.object({
  paymentId: z.string().uuid(),
  transactionId: transactionIdField,
  senderNumber: senderNumberField,
  amountPaid: z.coerce.number().positive(),
  // ADM-17, D8-15: a screenshot of the payment, if the seller adds one.
  evidenceKey: evidenceKeyField.optional(),
});
export type ConfirmTopUpInput = z.infer<typeof confirmTopUpSchema>;
