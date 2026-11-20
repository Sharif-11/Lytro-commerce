import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  publicProductListSchema,
  storefrontCatalogueListsSchema,
  type PublicProductListQuery,
  type StorefrontCatalogueListsBody,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { StorefrontSecretGuard } from '../../../common/guards/storefront-secret.guard';
import { headerValue } from '../../../common/http';
import { resolveLanguage } from '../../../common/i18n/accept-language';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { StorefrontProductListsDto } from '../dto/public-catalogue.dto';
import { PublicKeyGuard, type PublicApiRequest } from '../guards/public-key.guard';
import { PublicCatalogue } from '../services/public-catalogue';
import type { PublicProductPage } from '../types/public-catalogue';

// How many of a call's lists are worked out at once: a few, so a page's misses don't each wait for the last, and never
// so many that one call holds most of the process's database connections.
const LISTS_AT_ONCE = 3;

const listQuery = new ZodValidationPipe(publicProductListSchema);

/**
 * Load fix 3 (the owner, 2026-11-20): every product list a storefront page draws, in one call, so a designed home asks
 * the API once rather than once per row. Not part of the public API: only the storefront's own server, holding its
 * secret (which the edge never adds), is answered (StorefrontSecretGuard, first, so no one else's call is even counted).
 * Behind it the public key's gate as for every catalogue read (PublicKeyGuard): the shop from the key, its visitor's
 * minute taken once for the whole call, and the storefront's own key never counted against the shop's month (D9-32).
 * Each list is GET /v1/catalogue/products's query string, read and answered exactly as that route does
 * (PublicCatalogue.list, its cache included); one whose category isn't shown answers null, and the rest still answer.
 */
@ApiExcludeController()
@Controller('public/catalogue')
@PublicApiRoute()
@UseGuards(StorefrontSecretGuard, PublicKeyGuard)
export class StorefrontCatalogueController {
  constructor(@Inject(PublicCatalogue) private readonly catalogue: PublicCatalogue) {}

  @Post('lists')
  @HttpCode(200)
  @ResponseMessage('ProductsListed')
  @ZodResponse({ type: StorefrontProductListsDto })
  async lists(
    @Body(new ZodValidationPipe(storefrontCatalogueListsSchema)) body: StorefrontCatalogueListsBody,
    @Req() request: PublicApiRequest,
  ): Promise<{ lists: { page: PublicProductPage | null }[] }> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    const lang = resolveLanguage(headerValue(request.headers['accept-language']));
    // Every list is read before any is worked out, so a malformed one refuses the call as GET would refuse it.
    const queries = body.queries.map(
      (query) =>
        listQuery.transform(
          Object.fromEntries(new URLSearchParams(query)),
        ) as PublicProductListQuery,
    );
    const pages: (PublicProductPage | null)[] = [];
    for (let start = 0; start < queries.length; start += LISTS_AT_ONCE) {
      pages.push(
        ...(await Promise.all(
          queries.slice(start, start + LISTS_AT_ONCE).map(async (query) => {
            try {
              return (await this.catalogue.list(shop, query, lang)).data;
            } catch (error) {
              if (error instanceof ApiError && error.code === 'not_found') return null;
              throw error;
            }
          }),
        )),
      );
    }
    return { lists: pages.map((page) => ({ page })) };
  }
}
