import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { TenantState } from '@lytronix/validators';

export const meResponseSchema = z.object({
  subscriber: z.object({ id: z.string() }),
  isOwner: z.boolean(),
  permissions: z.array(z.string()),
  tenant: z
    .object({
      id: z.string(),
      slug: z.string(),
      shopName: z.string(),
      state: z.nativeEnum(TenantState),
      planName: z.string().nullable(),
      periodEnd: z.string().nullable(),
    })
    .nullable(),
});
export class MeResponseDto extends createZodDto(meResponseSchema) {}
