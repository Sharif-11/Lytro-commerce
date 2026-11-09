import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createPlatformBankAccountSchema,
  openPlanPaymentPageSchema,
  PaymentMethodKind,
  PaymentWay,
  platformGatewayKeysSchema,
  updatePlatformBankAccountSchema,
  updatePlatformPaymentMethodSchema,
} from '@lytronix/validators';

export class UpdatePlatformPaymentMethodDto extends createZodDto(
  updatePlatformPaymentMethodSchema,
) {}
export class CreatePlatformBankAccountDto extends createZodDto(createPlatformBankAccountSchema) {}
export class UpdatePlatformBankAccountDto extends createZodDto(updatePlatformBankAccountSchema) {}
export class PlatformGatewayKeysDto extends createZodDto(platformGatewayKeysSchema) {}
export class OpenPlanPaymentPageDto extends createZodDto(openPlanPaymentPageSchema) {}

const bankAccount = z.object({
  id: z.string(),
  bankName: z.string(),
  accountName: z.string(),
  accountNumber: z.string(),
  branch: z.string().nullable(),
  routingNumber: z.string().nullable(),
  swiftCode: z.string().nullable(),
  instructions: z.string().nullable(),
  enabled: z.boolean(),
  displayOrder: z.number(),
  createdAt: z.date(),
});
export class PlatformBankAccountDto extends createZodDto(bankAccount) {}

export class LytroPaymentMethodsDto extends createZodDto(
  z.object({
    methods: z.array(
      z.object({
        method: z.string(),
        kind: z.nativeEnum(PaymentMethodKind),
        enabled: z.boolean(),
        way: z.nativeEnum(PaymentWay),
        ways: z.array(z.nativeEnum(PaymentWay)),
        gateway: z
          .object({
            connected: z.boolean(),
            unreadable: z.boolean(),
            sandbox: z.boolean(),
            number: z.string().nullable(),
          })
          .nullable(),
      }),
    ),
    bankAccounts: z.array(bankAccount),
  }),
) {}

export class LytroGatewayTestDto extends createZodDto(
  z.object({ ok: z.boolean(), code: z.string().nullable() }),
) {}

export class PlanPaymentPageDto extends createZodDto(z.object({ url: z.string() })) {}
