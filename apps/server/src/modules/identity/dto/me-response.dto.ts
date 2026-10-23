import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { TenantState } from '@lytronix/validators';
import { liveBrandSchema } from '../../../common/dto/brand.dto';
import { imageViewSchema } from '../../../common/dto/media-views.dto';

export const meResponseSchema = z.object({
  subscriber: z.object({ id: z.string() }),
  isOwner: z.boolean(),
  permissions: z.array(z.string()),
  // The signed-in person's own name in the shop the call names; null when unnamed.
  name: z.string().nullable(),
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
      // TEN-16: the shop's logo for the dashboard's navigation; null for its monogram.
      logo: imageViewSchema.nullable(),
      // BRN-07: the identity the dashboard applies; null for Lytro's default.
      brand: liveBrandSchema.nullable(),
    })
    .nullable(),
  // TEN-31: every shop the signed-in person may open -- one opens directly, several show the picker.
  shops: z.array(
    z.object({ slug: z.string(), shopName: z.string(), role: z.enum(['owner', 'staff']) }),
  ),
  // LIF-21: no shop open yet, and a deleted one whose balance the next shop takes over (create-shop's note).
  hasDeletedShop: z.boolean(),
});
export class MeResponseDto extends createZodDto(meResponseSchema) {}
