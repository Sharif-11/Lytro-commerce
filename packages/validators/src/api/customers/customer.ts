import { z } from 'zod';
import {
  CUSTOMER_NAME_MAX_LENGTH,
  CUSTOMER_PAGE_SIZE,
  LIST_PAGE_SIZE_MAX,
} from '../../common/limits';

// GET customers (CUS-02): the shop's customers, searched by any part of the name or the phone (the last four digits
// find one), a page at a time.
export const customerListQuerySchema = z.object({
  q: z.string().trim().min(1).max(CUSTOMER_NAME_MAX_LENGTH).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(CUSTOMER_PAGE_SIZE),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
