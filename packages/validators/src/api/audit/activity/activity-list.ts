import { z } from 'zod';
import { AuditAction } from '../../../db/enums';

// GET activity: filters for the Activity page (AUD-04). Keyset pagination, never OFFSET.
export const listActivitySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  actorId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  // Opaque: the created-at and id of the last row the caller saw.
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListActivityQuery = z.infer<typeof listActivitySchema>;
