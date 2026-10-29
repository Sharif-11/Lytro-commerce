import { applyDecorators, Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { liveBrandSchema } from '../../../common/dto/brand.dto';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { BrandService } from '../../brand/services/brand.service';
import { DeliveryZoneService } from '../../delivery/services/delivery-zone.service';
import { MediaService } from '../../media/services/media.service';
import { TenantService } from '../../tenancy/services/tenant.service';
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
  // BRN-07: the shop's own identity as tokens, for the storefront and the shop's own site; null for Lytro's default.
  brand: liveBrandSchema.nullable(),
  // TEN-16, TEN-30, DLV-01: what the storefront's header, footer and delivery line show.
  logo: z
    .object({ id: z.string(), urls: z.object({ main: z.string(), thumbnail: z.string() }) })
    .nullable(),
  contact: z.object({
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
  }),
  deliveryZones: z.array(
    z.object({
      id: z.string(),
      name: z.object({ en: z.string(), bn: z.string() }),
      charge: z.string(),
      noDelivery: z.boolean(),
    }),
  ),
});
class PublicShopViewDto extends createZodDto(publicShopViewSchema) {}

// D3-1, API-07: the public API's first route: which shop a public key belongs to. The catalogue's routes sit behind the
// same gate (public-catalogue.controller.ts).
@ApiTags('Public API')
@Controller('public/shop')
@PublicApi()
export class PublicShopController {
  constructor(
    @Inject(AdTrackingService) private readonly adTracking: AdTrackingService,
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(DeliveryZoneService) private readonly zones: DeliveryZoneService,
  ) {}

  @Get()
  @ResponseMessage('ShopRetrieved')
  @ApiOperation({
    summary:
      "The shop this public key belongs to: its name, logo, contact details, delivery zones, the Meta Pixel its pages load and its brand identity's tokens (API-05, API-07, TEN-16, TEN-30, DLV-01, LND-15, BRN-07)",
  })
  @ZodResponse({ type: PublicShopViewDto })
  async shop(@Req() request: PublicApiRequest): Promise<PublicShopView> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    const tenantId = shop.row.id;
    const contact = await this.tenants.runStandalone((tx) =>
      this.tenants.findContactDetails(tx, tenantId),
    );
    const delivery = await this.zones.settings(tenantId);
    return {
      name: shop.row.shopName,
      slug: shop.row.slug,
      metaPixelId: await this.adTracking.pixelOf(tenantId),
      brand: await this.brand.live(tenantId),
      logo: await this.media.logoOf(tenantId),
      contact: {
        phone: contact?.contactPhone ?? null,
        email: contact?.contactEmail ?? null,
        address: contact?.businessAddress ?? null,
      },
      deliveryZones: delivery.zones.map((zone) => ({
        id: zone.id,
        name: zone.label,
        charge: zone.charge,
        noDelivery: zone.noDelivery,
      })),
    };
  }
}
