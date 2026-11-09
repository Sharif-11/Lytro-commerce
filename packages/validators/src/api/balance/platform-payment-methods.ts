import { z } from 'zod';
import { PaymentWay, PlanPaymentPageFrom } from '../../db/enums';
import { gatewayCredentialsSchema } from '../payment-methods/gateway';
import { bankAccountInput } from '../payment-methods/payment-methods';

/** OPERATOR-CONSOLE-DESIGN §10 (2026-11-09): a method shops may pay Lytro by, switched on or off, or its way changed. */
export const updatePlatformPaymentMethodSchema = z
  .object({
    enabled: z.boolean().optional(),
    way: z.nativeEnum(PaymentWay).optional(),
  })
  .strict()
  .refine((value) => value.enabled !== undefined || value.way !== undefined, {
    message: 'Nothing to change.',
  });
export type UpdatePlatformPaymentMethodInput = z.infer<typeof updatePlatformPaymentMethodSchema>;

// WAL-14's fields, as a shop's bank account has them; shown to shops in the operator's order.
const bankAccount = bankAccountInput.omit({ id: true, active: true }).extend({
  enabled: z.boolean().optional(),
  displayOrder: z.coerce.number().int().optional(),
});

export const createPlatformBankAccountSchema = bankAccount;
export type CreatePlatformBankAccountInput = z.infer<typeof createPlatformBankAccountSchema>;

export const updatePlatformBankAccountSchema = bankAccount.partial();
export type UpdatePlatformBankAccountInput = z.infer<typeof updatePlatformBankAccountSchema>;

/** ADM-10: Lytro's own bKash keys, and the number that receives the money. Only ever in a request's body. */
export const platformGatewayKeysSchema = gatewayCredentialsSchema.extend({
  number: z.string().trim().min(1).max(20),
});
export type PlatformGatewayKeysInput = z.infer<typeof platformGatewayKeysSchema>;

/** PAYMENT-PAGE-DESIGN §8: a shop opens the payment page for a payment; where in the dashboard it comes back to. */
export const openPlanPaymentPageSchema = z
  .object({ from: z.nativeEnum(PlanPaymentPageFrom) })
  .strict();
export type OpenPlanPaymentPageInput = z.infer<typeof openPlanPaymentPageSchema>;
