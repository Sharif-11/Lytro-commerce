import { z } from 'zod';
import { NAME_MAX_LENGTH, SLUG_MAX_LENGTH } from '../../common/limits';

// POST shops — the create-shop step after identity verification (AUTH-10, AUTH-28).
export const createShopSchema = z.object({
  ownerName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  shopName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  address: z.string().max(SLUG_MAX_LENGTH).optional(),
});
export type CreateShopInput = z.infer<typeof createShopSchema>;

// GET shops/address-check -- the create-shop step's live verdict on an address as it is typed (AUTH-11, TEN-26). A
// longer value than an address may be is still answered, as a format problem, rather than refused outright.
export const addressCheckQuerySchema = z.object({
  address: z
    .string()
    .trim()
    .min(1)
    .max(SLUG_MAX_LENGTH * 2),
});
export type AddressCheckQuery = z.infer<typeof addressCheckQuerySchema>;
