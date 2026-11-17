import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { updateAdTrackingSchema, dateField } from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class UpdateAdTrackingDto extends createZodDto(updateAdTrackingSchema) {}

// --- Responses. The Conversions API token is never in one, only whether it is set (LND-17). ---

export class AdTrackingViewDto extends createZodDto(
  z.object({
    metaPixelId: z.string().nullable(),
    conversionsApiConnected: z.boolean(),
    updatedAt: dateField().nullable(),
  }),
) {}

export class CatalogFeedViewDto extends createZodDto(
  z.object({ url: z.string(), regeneratedAt: dateField() }),
) {}
