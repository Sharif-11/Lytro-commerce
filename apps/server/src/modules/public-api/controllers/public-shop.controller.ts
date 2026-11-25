import {
  applyDecorators,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { publicShopQuerySchema } from '@lytronix/validators';
import { liveBrandSchema } from '../../../common/dto/brand.dto';
import { imageViewSchema } from '../../../common/dto/media-views.dto';
import { publicStorefrontSchema } from '../../../common/dto/storefront.dto';
import type { HttpResponse } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { PublicApiRoute, ServedWhilePaused } from '../../../common/decorators/public-api';
import { contactHidden, storefrontPaused } from '../../fair-use/services/fair-use-rules';
import { FairUseSwitch } from '../../fair-use/services/fair-use-switch';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { BrandService } from '../../brand/services/brand.service';
import { DeliveryZoneService } from '../../delivery/services/delivery-zone.service';
import { MediaService } from '../../media/services/media.service';
import { StorefrontDesignService } from '../../storefront-design/services/storefront-design.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import { PublicKeyGuard, type PublicApiRequest } from '../guards/public-key.guard';
import { AdTrackingService } from '../services/ad-tracking.service';
import type { PublicShopView } from '../types/public-api';

/** API-05, API-14: a public API route: on the API host at /v1/..., behind a public key and its limits. */
export const PublicApi = (): ClassDecorator & MethodDecorator =>
  applyDecorators(PublicApiRoute(), UseGuards(PublicKeyGuard));

const publicShopViewSchema = z.object({
  name: z.string(),
  // PYG-25 (PF-13, PF-35): a pay-as-you-go shop's storefront paused until it activates.
  paused: z.boolean(),
  slug: z.string(),
  metaPixelId: z.string().nullable(),
  // BRN-07: the shop's own identity as tokens, for the storefront and the shop's own site; null for Lytro's default.
  brand: liveBrandSchema.nullable(),
  // TEN-16, TEN-30, DLV-01: what the storefront's header, footer and delivery line show.
  logo: z
    .object({ id: z.string(), urls: z.object({ main: z.string(), thumbnail: z.string() }) })
    .nullable(),
  // SB-5: the square icon for the browser tab and the installed app; null to make it from the logo.
  icon: imageViewSchema.nullable(),
  // SB-11 to SB-16: the storefront design, its photos and what it points at resolved.
  design: publicStorefrontSchema,
  // SB-9: what is on sale now, for the announcement that writes itself.
  sale: z.object({ products: z.number(), bestDiscount: z.number() }),
  contact: z.object({
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    // SFT-21 (UI/UX batch 2): where shoppers chat with the shop; added keys, each null when unset.
    whatsapp: z.string().nullable(),
    messenger: z.string().nullable(),
    facebookPage: z.string().nullable(),
  }),
  deliveryZones: z.array(
    z.object({
      id: z.string(),
      name: z.object({ en: z.string(), bn: z.string() }),
      charge: z.string(),
      noDelivery: z.boolean(),
      // STOREFRONT-BUILDER-PLAN BL-10: the home zone, everywhere else, or a zone of the shop's own, for the bar's
      // delivery line ("inside up to ৳70 · outside up to ৳130").
      kind: z.enum(['home', 'fallback', 'other']),
    }),
  ),
  // BL-10: what a kilo over the first adds to any zone's charge; the bar says "up to" only without it (RAT-14).
  extraDeliveryChargePerKg: z.string(),
});
export class PublicShopViewDto extends createZodDto(publicShopViewSchema) {}
export class PublicShopQueryDto extends createZodDto(publicShopQuerySchema) {}

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
    @Inject(StorefrontDesignService) private readonly designs: StorefrontDesignService,
    @Inject(FairUseSwitch) private readonly fairUse: FairUseSwitch,
  ) {}

  @Get()
  @ServedWhilePaused()
  @ResponseMessage('ShopRetrieved')
  @ApiOperation({
    summary:
      "The shop this public key belongs to: its name, logo, icon, contact details, delivery zones, the Meta Pixel its pages load, its brand identity's tokens and its storefront design; with `preview`, a signed link's draft, never kept by any cache (API-05, API-07, TEN-16, TEN-30, DLV-01, LND-15, BRN-07, SB-5, SB-12, SB-14)",
  })
  @ZodResponse({ type: PublicShopViewDto })
  async shop(
    @Query(new ZodValidationPipe(PublicShopQueryDto.schema)) query: PublicShopQueryDto,
    @Req() request: PublicApiRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<PublicShopView> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    const tenantId = shop.row.id;
    const preview = query.preview ?? null;
    // SB-12: a draft is never kept by a browser, Cloudflare or the storefront's own cache.
    if (preview !== null) response.setHeader('Cache-Control', 'no-store');
    const design = await this.designs.live(tenantId, preview);
    const contact = await this.tenants.runStandalone((tx) =>
      this.tenants.findContactDetails(tx, tenantId),
    );
    const delivery = await this.zones.settings(tenantId);
    const fairUseOn = await this.fairUse.isOn();
    // PYG-29 (PF-15, PF-40, PFQ-4): a pay-as-you-go storefront shows no direct contact -- its address and Facebook page
    // stay -- so the shop can't be used as a catalogue only.
    const hidden = contactHidden(fairUseOn, shop.row.state);
    return {
      name: shop.row.shopName,
      // PYG-25 (PF-13, PF-35): its storefront shows "শিগগিরই আবার চালু হচ্ছে" until it activates.
      paused: storefrontPaused(fairUseOn, shop.row),
      slug: shop.row.slug,
      metaPixelId: await this.adTracking.pixelOf(tenantId),
      brand: await this.brand.live(tenantId),
      logo: await this.media.logoOf(tenantId),
      icon: await this.media.iconOf(tenantId),
      design,
      sale: await this.designs.sale(tenantId),
      contact: {
        phone: hidden ? null : (contact?.contactPhone ?? null),
        email: hidden ? null : (contact?.contactEmail ?? null),
        address: contact?.businessAddress ?? null,
        whatsapp: hidden ? null : (contact?.whatsapp ?? null),
        messenger: hidden ? null : (contact?.messenger ?? null),
        facebookPage: contact?.facebookPage ?? null,
      },
      deliveryZones: delivery.zones.map((zone) => ({
        id: zone.id,
        name: zone.label,
        charge: zone.charge,
        noDelivery: zone.noDelivery,
        kind: zone.isHome ? 'home' : zone.isFallback ? 'fallback' : 'other',
      })),
      extraDeliveryChargePerKg: delivery.extraDeliveryChargePerKg,
    };
  }
}
