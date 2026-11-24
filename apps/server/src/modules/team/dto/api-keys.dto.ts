import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  apiCapInputSchema,
  ApiKeyPurpose,
  ApiKeyType,
  createApiKeySchema,
  updateApiKeySchema,
  coercedDateField,
  dateField,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
export class UpdateApiKeyDto extends createZodDto(updateApiKeySchema) {}

// --- Responses. A key's value appears once, in the answer to its creation (API-01). ---

const apiKeyViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(ApiKeyType),
  prefix: z.string(),
  websites: z.array(z.string()),
  expiresAt: dateField().nullable(),
  createdAt: dateField(),
  lastUsedAt: dateField().nullable(),
  revokedAt: dateField().nullable(),
  // Slice 12: "storefront" for the key Lytro keeps for the shop's storefront; null for the shop's own.
  purpose: z.enum(ApiKeyPurpose).nullable(),
});
export class ApiKeyViewDto extends createZodDto(apiKeyViewSchema) {}
export class ApiKeyListDto extends createZodDto(z.array(apiKeyViewSchema)) {}

// PYG-26 (PAYG-FAIR-USE-PLAN PF-36): what the shop's own website's API cost this cycle, and its cap.
const apiChargeSummarySchema = z.object({
  applies: z.boolean(),
  cycleStart: coercedDateField(),
  requests: z.number(),
  free: z.number(),
  rate: z.string(),
  charged: z.string(),
  cap: z.string(),
  stopped: z.boolean(),
  days: z.array(
    z.object({
      day: z.string(),
      requests: z.number(),
      billable: z.number(),
      charged: z.string(),
    }),
  ),
});
export class ApiChargeSummaryDto extends createZodDto(apiChargeSummarySchema) {}
export class ApiCapDto extends createZodDto(apiCapInputSchema) {}
export class CreatedApiKeyViewDto extends createZodDto(
  apiKeyViewSchema.extend({ key: z.string() }),
) {}
