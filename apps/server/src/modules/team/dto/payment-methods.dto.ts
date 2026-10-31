import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  PaymentMethod,
  PaymentMethodKind,
  paymentMethodSchemaFor,
  VerificationLevel,
  WalletAccountType,
} from '@lytronix/validators';

// WAL-01, WAL-14 (Slice 5.1): the request shapes, built from the shared schemas -- a wallet's accounts carry a number
// and an account type, a bank's the WAL-14 details. The route picks the method's own shape.
export class WalletMethodDto extends createZodDto(paymentMethodSchemaFor(PaymentMethod.Bkash)) {}
export class BankMethodDto extends createZodDto(paymentMethodSchemaFor(PaymentMethod.Bank)) {}

export const paymentAccountViewSchema = z.object({
  id: z.string(),
  accountName: z.string(),
  number: z.string().nullable(),
  accountType: z.nativeEnum(WalletAccountType).nullable(),
  note: z.string().nullable(),
  bankName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  branch: z.string().nullable(),
  routingNumber: z.string().nullable(),
  swiftCode: z.string().nullable(),
  instructions: z.string().nullable(),
  active: z.boolean(),
});

export class PaymentMethodsViewDto extends createZodDto(
  z.object({
    methods: z.array(
      z.object({
        method: z.nativeEnum(PaymentMethod),
        kind: z.nativeEnum(PaymentMethodKind),
        enabled: z.boolean(),
        levels: z.array(z.nativeEnum(VerificationLevel)),
        accounts: z.array(paymentAccountViewSchema),
      }),
    ),
    ownerPhoneVerified: z.boolean(),
  }),
) {}
