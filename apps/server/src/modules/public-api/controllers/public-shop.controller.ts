import { applyDecorators, Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { PublicKeyGuard, type PublicApiRequest } from '../guards/public-key.guard';
import { AdTrackingService } from '../services/ad-tracking.service';
import type { PublicShopView } from '../types/public-api';

/** API-05, API-14: a public API route: on the API host at /v1/..., behind a public key and its limits. */
export const PublicApi = (): ClassDecorator & MethodDecorator =>
  applyDecorators(PublicApiRoute(), UseGuards(PublicKeyGuard));

const publicShopViewSchema = z.object({
  name: z.string(),
  slug: z.string(),
  metaPixelId: z.string().nullable(),
});
class PublicShopViewDto extends createZodDto(publicShopViewSchema) {}

// D3-1, API-07: the public API's first route: which shop a public key belongs to. The catalogue's routes sit behind the
// same gate (public-catalogue.controller.ts).
@ApiTags('Public API')
@Controller('public/shop')
@PublicApi()
export class PublicShopController {
  constructor(@Inject(AdTrackingService) private readonly adTracking: AdTrackingService) {}

  @Get()
  @ResponseMessage('ShopRetrieved')
  @ApiOperation({
    summary:
      'The shop this public key belongs to, and the Meta Pixel its pages load (API-05, API-07, LND-15)',
  })
  @ZodResponse({ type: PublicShopViewDto })
  async shop(@Req() request: PublicApiRequest): Promise<PublicShopView> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    return {
      name: shop.row.shopName,
      slug: shop.row.slug,
      metaPixelId: await this.adTracking.pixelOf(shop.row.id),
    };
  }
}
