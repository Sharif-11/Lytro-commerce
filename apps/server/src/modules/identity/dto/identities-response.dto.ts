import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { IdentityKind, OauthProvider } from '@lytronix/validators';

export const identitiesListSchema = z.object({
  identities: z.array(
    z.object({
      id: z.string(),
      kind: z.nativeEnum(IdentityKind),
      value: z.string(),
    }),
  ),
});
export class IdentitiesListDto extends createZodDto(identitiesListSchema) {}

export const oauthAttachedSchema = z.object({ attached: z.nativeEnum(IdentityKind) });
export class OauthAttachedDto extends createZodDto(oauthAttachedSchema) {}

export const oauthUrlSchema = z.object({ url: z.string() });
export class OauthUrlDto extends createZodDto(oauthUrlSchema) {}

export const oauthProvidersSchema = z.object({ providers: z.array(z.nativeEnum(OauthProvider)) });
export class OauthProvidersDto extends createZodDto(oauthProvidersSchema) {}
