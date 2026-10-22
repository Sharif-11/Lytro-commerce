import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const shopCreatedSchema = z.object({
  tenantId: z.string(),
  address: z.string(),
  shopUrl: z.string(),
  next: z.literal('set-password'),
});
export class ShopCreatedDto extends createZodDto(shopCreatedSchema) {}

// AUTH-11, TEN-26: the create-shop screen's live verdict on an address.
export const addressCheckSchema = z.object({
  available: z.boolean(),
  address: z.string().nullable(),
  reason: z.enum(['format', 'unavailable']).nullable(),
  suggestion: z.string().nullable(),
});
export class AddressCheckDto extends createZodDto(addressCheckSchema) {}
