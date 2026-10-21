import { applyDecorators, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { PublicKeyGuard, type PublicApiRequest } from '../guards/public-key.guard';
import type { PublicShopView } from '../types/public-api';

/** API-05, API-14: a public API route: on the API host at /v1/..., behind a public key and its limits. */
export const PublicApi = (): ClassDecorator & MethodDecorator =>
  applyDecorators(PublicApiRoute(), UseGuards(PublicKeyGuard));

const publicShopViewSchema = z.object({ name: z.string(), slug: z.string() });
class PublicShopViewDto extends createZodDto(publicShopViewSchema) {}

// D3-1, API-07: the public API's first route: which shop a public key belongs to. The catalogue's routes sit behind the
// same gate (public-catalogue.controller.ts).
@ApiTags('Public API')
@Controller('public/shop')
@PublicApi()
export class PublicShopController {
  @Get()
  @ResponseMessage('ShopRetrieved')
  @ApiOperation({ summary: 'The shop this public key belongs to (API-05, API-07)' })
  @ZodResponse({ type: PublicShopViewDto })
  shop(@Req() request: PublicApiRequest): PublicShopView {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    return { name: shop.row.shopName, slug: shop.row.slug };
  }
}
