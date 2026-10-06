import { z } from 'zod';
import { NAME_MAX_LENGTH, SLUG_MAX_LENGTH } from '../../common/limits';

// POST shops — the create-shop step after identity verification (AUTH-10, AUTH-28).
export const createShopSchema = z.object({
  ownerName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  shopName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  address: z.string().max(SLUG_MAX_LENGTH).optional(),
});
export type CreateShopInput = z.infer<typeof createShopSchema>;
