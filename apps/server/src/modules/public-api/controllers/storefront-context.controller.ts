import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { StorefrontSecretGuard } from '../../../common/guards/storefront-secret.guard';
import {
  StorefrontContextService,
  type StorefrontContext,
} from '../services/storefront-context.service';

const storefrontContextSchema = z.object({
  outcome: z.enum(['open', 'closed', 'not_found']),
  shop: z
    .object({
      slug: z.string(),
      storefrontEnabled: z.boolean(),
      key: z.string(),
      origin: z.string(),
      mainHost: z.string().nullable(),
      publicOrigin: z.string(),
    })
    .nullable(),
});
class StorefrontContextDto extends createZodDto(storefrontContextSchema) {}

// Slice 12, agreed 2026-10-29: the storefront's own server asks which shop a host serves and the key it calls the
// public API with. Not a public API route and never on a shop's host: only a request carrying the storefront's secret,
// which the edge never adds, is answered (StorefrontSecretGuard).
@ApiExcludeController()
@Controller('internal/storefront')
@SkipTenant()
@UseGuards(StorefrontSecretGuard)
export class StorefrontContextController {
  constructor(
    @Inject(StorefrontContextService) private readonly context: StorefrontContextService,
  ) {}

  @Get('context')
  @ResponseMessage('ShopRetrieved')
  @ZodResponse({ type: StorefrontContextDto })
  read(@Query('host') host: string | undefined): Promise<StorefrontContext> {
    return host
      ? this.context.forHost(host)
      : Promise.resolve({ outcome: 'not_found', shop: null });
  }
}
