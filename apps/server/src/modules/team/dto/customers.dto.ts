import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { shopperPasswordByStaffSchema } from '@lytronix/validators';

// CUS-14: the new password staff set for a customer's shopper account.
export class ShopperPasswordByStaffDto extends createZodDto(shopperPasswordByStaffSchema) {}

// --- Responses (CUS-01, CUS-02). ---

const customerItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  orderCount: z.number(),
  totalSpent: z.string(),
  lastOrderAt: z.coerce.date().nullable(),
  firstOrderAt: z.coerce.date(),
});

const customerPageSchema = z.object({
  customers: z.array(customerItemSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class CustomerPageDto extends createZodDto(customerPageSchema) {}

const customerViewSchema = customerItemSchema.extend({
  lastAddress: z.object({ locationId: z.number(), deliveryAddress: z.string() }).nullable(),
  account: z.object({ createdAt: z.coerce.date() }).nullable(),
});
export class CustomerViewDto extends createZodDto(customerViewSchema) {}
