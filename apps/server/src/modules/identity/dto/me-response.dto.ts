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
      // LIF-24 (decided 2026-10-16): lets the dashboard shell show the narrow suspended-owner view instead
      // of the full nav, now that the owner can actually reach /me while suspended (suspendedOwner: true).
      suspended: z.boolean(),
      planName: z.string().nullable(),
      periodEnd: z.string().nullable(),
    })
    .nullable(),
});
export class MeResponseDto extends createZodDto(meResponseSchema) {}
