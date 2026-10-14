import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const nextStepSchema = z.enum([
  'create-shop',
  'dashboard',
  'set-password',
  'renewal',
  'purchase',
  'unavailable',
]);

export const codeIssuedSchema = z.object({
  expiresInSeconds: z.number(),
  resendAfterSeconds: z.number(),
});
export class CodeIssuedDto extends createZodDto(codeIssuedSchema) {}

// The cookie never appears in the body -- it goes out as a Set-Cookie header (SEC-14).
export const signedInBodySchema = z.object({
  next: nextStepSchema,
  tenantId: z.string().nullable(),
  csrfToken: z.string(),
});
export class SignedInBodyDto extends createZodDto(signedInBodySchema) {}
