import { z } from 'zod';
import { transactionIdField } from '../../common/transaction-id';

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
  senderNumber: z.string().trim().min(1),
  amountPaid: z.coerce.number().positive(),
});
export type ConfirmTopUpInput = z.infer<typeof confirmTopUpSchema>;
