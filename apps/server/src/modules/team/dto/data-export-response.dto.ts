import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// LIF-16/17: never includes the file bytes -- that's the download route's own concern.
export const dataExportSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  status: z.enum(['pending', 'ready', 'failed']),
  fileSizeBytes: z.number().nullable(),
  contentType: z.string().nullable(),
  failureReason: z.string().nullable(),
  requestedAt: z.date(),
  readyAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
});
export class DataExportDto extends createZodDto(dataExportSchema) {}
export class DataExportListDto extends createZodDto(dataExportSchema.array()) {}
