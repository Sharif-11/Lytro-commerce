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

// AUTH-21: phone sign-in only, not the shared signedInBodySchema above -- by now the phone's owner has
// already proved they hold it (the code just verified), so naming "this shop already existed" here is not
// the enumeration leak AUTH-13/P1-E10 refuses to allow on the *request* step, before proof of ownership.
export const phoneSignedInBodySchema = signedInBodySchema.extend({
  suggestPassword: z.boolean(),
});
export class PhoneSignedInBodyDto extends createZodDto(phoneSignedInBodySchema) {}
