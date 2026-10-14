import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const shopCreatedSchema = z.object({
  tenantId: z.string(),
  address: z.string(),
  shopUrl: z.string(),
  next: z.literal('set-password'),
});
export class ShopCreatedDto extends createZodDto(shopCreatedSchema) {}
