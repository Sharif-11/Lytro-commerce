import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { Language } from '@lytronix/validators';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { headerValue, type HttpResponse } from '../../../common/http';
import { resolveLanguage } from '../../../common/i18n/accept-language';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  CatalogueVersionViewDto,
  PublicCatalogueVersionedDto,
  PublicCategoriesDto,
  PublicProductDetailDto,
  PublicProductListQueryDto,
  PublicProductPageDto,
} from '../dto/public-catalogue.dto';
import type { PublicApiRequest } from '../guards/public-key.guard';
import { PublicCatalogue } from '../services/public-catalogue';
import type { ApiShop } from '../types/public-api';
import type {
  CatalogueAnswer,
  CatalogueVersionView,
  PublicCategory,
  PublicProductDetail,
  PublicProductPage,
} from '../types/public-catalogue';
import { PublicApi } from './public-shop.controller';

// CCH-03: an answer depends on the website (CORS), the key (the shop) and the language of its message.
const VARY = 'Origin, Authorization, Accept-Language';

// PRD-09, CCH-01 to CCH-04, LND-04, API-07: the public catalogue, behind the public key's gate like every /v1 route.
// Each answer carries a tag (a matching If-None-Match is answered 304 without a body) and how long the shopper's
// browser may keep it; nothing is stored by Cloudflare, so every request is counted (RTE-04).
@ApiTags('Public API')
@Controller('public/catalogue')
@PublicApi()
export class PublicCatalogueController {
  constructor(@Inject(PublicCatalogue) private readonly catalogue: PublicCatalogue) {}

  @Get('version')
  @ResponseMessage('CatalogueVersionRetrieved')
  @ApiOperation({
    summary:
      "The catalogue's current version: put it in the catalogue addresses after it as `v`, so a change is seen at once " +
      '(CCH-04)',
  })
  @ZodResponse({ type: CatalogueVersionViewDto })
  async version(
    @Req() request: PublicApiRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<CatalogueVersionView> {
    return this.send(response, await this.catalogue.version(shopOf(request), langOf(request)));
  }

  @Get('products')
  @ResponseMessage('ProductsListed')
  @ApiOperation({
    summary:
      "A page of the shop's active products, by category, search and order; a cursor for the next (PRD-09, CCH-11)",
  })
  @ZodResponse({ type: PublicProductPageDto })
  async products(
    @Query(new ZodValidationPipe(PublicProductListQueryDto.schema))
    query: PublicProductListQueryDto,
    @Req() request: PublicApiRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<PublicProductPage> {
    return this.send(response, await this.catalogue.list(shopOf(request), query, langOf(request)));
  }

  @Get('products/:slug')
  @ResponseMessage('ProductRetrieved')
  @ApiOperation({
    summary:
      'An active product by its link; an old link answers with the current one, to redirect to (PRD-09, LND-04)',
  })
  @ZodResponse({ type: PublicProductDetailDto })
  async product(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(PublicCatalogueVersionedDto.schema))
    _query: PublicCatalogueVersionedDto,
    @Req() request: PublicApiRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<PublicProductDetail> {
    return this.send(
      response,
      await this.catalogue.product(shopOf(request), slug, langOf(request)),
    );
  }

  @Get('categories')
  @ResponseMessage('CategoriesListed')
  @ApiOperation({ summary: "The shop's visible categories, as a tree (PRD-03)" })
  @ZodResponse({ type: PublicCategoriesDto })
  async categories(
    @Query(new ZodValidationPipe(PublicCatalogueVersionedDto.schema))
    _query: PublicCatalogueVersionedDto,
    @Req() request: PublicApiRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<{ categories: PublicCategory[] }> {
    return this.send(response, await this.catalogue.categories(shopOf(request), langOf(request)));
  }

  /** The answer's tag and lifetime as headers; a request already holding this tag gets 304 when it is sent. */
  private send<T>(response: HttpResponse, answer: CatalogueAnswer<T>): T {
    response.setHeader('ETag', answer.etag);
    response.setHeader('Cache-Control', answer.cacheControl);
    response.setHeader('Vary', VARY);
    return answer.data;
  }
}

function shopOf(request: PublicApiRequest): ApiShop {
  if (!request.apiShop) throw new Error('the public key guard names the shop');
  return request.apiShop;
}

function langOf(request: PublicApiRequest): Language {
  return resolveLanguage(headerValue(request.headers['accept-language']));
}
