import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  PaymentMethod,
  PaymentMethodKind,
  paymentMethodTypeReasonSchema,
  RetireState,
} from '@lytronix/validators';

export class PaymentMethodTypeReasonDto extends createZodDto(paymentMethodTypeReasonSchema) {}

// WAL-18 (Slice 8.7): a payment method type as the operator sees it, and what leans on it.
const operatorPaymentMethodTypeSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  kind: z.nativeEnum(PaymentMethodKind),
  state: z.nativeEnum(RetireState),
  retiringSince: z.coerce.date().nullable(),
  removedAt: z.coerce.date().nullable(),
  shopsOn: z.number(),
  shopsWithAccounts: z.number(),
  openPayments: z.number(),
  // D8-65, D8-66: switched on or holding an account, each shop once: the shops a retire or its undo tells.
  shopsSetUp: z.number(),
  lytroTakes: z.boolean(),
});
export class OperatorPaymentMethodTypeListDto extends createZodDto(
  z.object({ types: z.array(operatorPaymentMethodTypeSchema) }),
) {}
export class PaymentMethodTypeRetiredDto extends createZodDto(
  z.object({ type: operatorPaymentMethodTypeSchema, told: z.number() }),
) {}
export class PaymentMethodTypeRemovedDto extends createZodDto(
  z.object({ type: operatorPaymentMethodTypeSchema, cleared: z.number() }),
) {}
