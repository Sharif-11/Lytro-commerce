import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { deliveryEstimateSchema, type DeliveryEstimateInput } from '@lytronix/validators';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { LocationService } from '../../delivery/services/location.service';
import type { LocationsView } from '../../delivery/types/delivery';
import { OrderPricing, type DeliveryEstimate } from '../../orders/services/order-pricing';
import type { PublicApiRequest } from '../guards/public-key.guard';
import { PublicApi } from './public-shop.controller';

const bilingual = z.object({ en: z.string(), bn: z.string() });
const thana = z.object({
  id: z.number(),
  nameEn: z.string(),
  nameBn: z.string(),
  cityCode: z.string().nullable(),
});
class PublicLocationsDto extends createZodDto(
  z.object({
    cities: z.array(z.object({ code: z.string(), nameEn: z.string(), nameBn: z.string() })),
    zillas: z.array(
      z.object({ id: z.number(), nameEn: z.string(), nameBn: z.string(), thanas: z.array(thana) }),
    ),
  }),
) {}
class DeliveryEstimateBodyDto extends createZodDto(deliveryEstimateSchema) {}
class DeliveryEstimateDto extends createZodDto(
  z.object({
    zone: z
      .object({ id: z.string(), name: bilingual, charge: z.string(), noDelivery: z.boolean() })
      .nullable(),
    deliveryCharge: z.string().nullable(),
    range: z.object({ from: z.string(), to: z.string() }).nullable(),
    deliverable: z.boolean(),
    notDeliveredHere: z.array(z.string()),
  }),
) {}

// CUS-08, SFT-20, LND-08 (D4-9), pulled forward from Phase 4 Slice 4.2 for the storefront (agreed 2026-10-29): the
// canonical thana list, and what delivering a cart's items to a thana would cost, priced by the one function an order
// is priced by.
@ApiTags('Public API')
@Controller('public')
@PublicApi()
export class PublicDeliveryController {
  constructor(
    @Inject(LocationService) private readonly locations: LocationService,
    @Inject(OrderPricing) private readonly pricing: OrderPricing,
  ) {}

  @Get('locations')
  @ResponseMessage('LocationsListed')
  @ApiOperation({ summary: 'The canonical zillas, cities and thanas every address uses (CUS-08)' })
  @ZodResponse({ type: PublicLocationsDto })
  list(): Promise<LocationsView> {
    return this.locations.list();
  }

  @Post('delivery-estimate')
  @HttpCode(200)
  @ResponseMessage('DeliveryEstimated')
  @ApiOperation({
    summary:
      "What these items' delivery would cost to a thana, or the range across the shop's zones before one is chosen (SFT-20, ORD-06a)",
  })
  @ZodResponse({ type: DeliveryEstimateDto })
  estimate(
    @Body(new ZodValidationPipe(DeliveryEstimateBodyDto.schema)) body: DeliveryEstimateInput,
    @Req() request: PublicApiRequest,
  ): Promise<DeliveryEstimate> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    return this.pricing.estimate(shop.row.id, body);
  }
}
