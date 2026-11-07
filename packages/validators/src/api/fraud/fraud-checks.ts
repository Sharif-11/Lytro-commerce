import { z } from 'zod';
import { nonNegativeMoneyField } from '../../common/money';
import { orderPhoneField } from '../orders/order';

// POST /fraud-checks (FRD-01): the phone to check, in any way a Bangladeshi mobile number is written; kept in its local
// form (01XXXXXXXXX), the only form Steadfast takes. A malformed number is refused here, before any courier is asked:
// Steadfast answers one with someone else's figures (Slice 7.5's try, 2026-11-07).
export const runFraudCheckSchema = z
  .object({
    phone: orderPhoneField,
  })
  .strict();
export type RunFraudCheckInput = z.infer<typeof runFraudCheckSchema>;

// GET /fraud-checks?phone= (FRD-01): the latest check of a phone, read without asking anyone.
export const fraudCheckQuerySchema = z
  .object({
    phone: orderPhoneField,
  })
  .strict();
export type FraudCheckQuery = z.infer<typeof fraudCheckQuerySchema>;

// PUT /fraud-checks/rule (FRD-05, D7-50): whether every new cash-on-delivery order is checked, and from what amount. On
// with no smallest amount until the owner changes it.
export const updateFraudRuleSchema = z
  .object({
    codOrders: z.boolean(),
    minAmount: nonNegativeMoneyField.nullable(),
  })
  .strict();
export type UpdateFraudRuleInput = z.infer<typeof updateFraudRuleSchema>;
