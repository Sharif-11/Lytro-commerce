import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  ApiKeyPurpose,
  ApiKeyType,
  createApiKeySchema,
  updateApiKeySchema,
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
export class CreatedApiKeyViewDto extends createZodDto(
  apiKeyViewSchema.extend({ key: z.string() }),
) {}
