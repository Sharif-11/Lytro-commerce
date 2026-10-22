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
      // BIL-17: whether the plan renews itself from the balance.
      autoRenewEnabled: z.boolean(),
    })
    .nullable(),
  // TEN-31: every shop the signed-in person may open -- one opens directly, several show the picker.
  shops: z.array(
    z.object({ slug: z.string(), shopName: z.string(), role: z.enum(['owner', 'staff']) }),
  ),
});
export class MeResponseDto extends createZodDto(meResponseSchema) {}
