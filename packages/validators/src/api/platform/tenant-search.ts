import { z } from 'zod';

// GET /operator/tenants: a shop-name/slug search for the operator's tenant list (LIF-24's own suspend/
// restore screen needs this to find a tenant without already knowing its id). Keyset pagination, never OFFSET
// (the same discipline listActivitySchema already follows).
export const searchTenantsSchema = z.object({
  query: z.string().trim().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SearchTenantsQuery = z.infer<typeof searchTenantsSchema>;
