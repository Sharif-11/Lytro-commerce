import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  ApiKeyPurpose,
  ApiKeyType,
  createApiKeySchema,
  updateApiKeySchema,
} from '@lytronix/validators';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
export class UpdateApiKeyDto extends createZodDto(updateApiKeySchema) {}

// --- Responses. A key's value appears once, in the answer to its creation (API-01). ---

const apiKeyViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(ApiKeyType),
  prefix: z.string(),
  websites: z.array(z.string()),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
  lastUsedAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
  // Slice 12: "storefront" for the key Lytro keeps for the shop's storefront; null for the shop's own.
  purpose: z.nativeEnum(ApiKeyPurpose).nullable(),
});
export class ApiKeyViewDto extends createZodDto(apiKeyViewSchema) {}
export class ApiKeyListDto extends createZodDto(z.array(apiKeyViewSchema)) {}
export class CreatedApiKeyViewDto extends createZodDto(
  apiKeyViewSchema.extend({ key: z.string() }),
) {}
