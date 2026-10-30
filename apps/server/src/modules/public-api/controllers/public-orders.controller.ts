import { Body, Controller, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import {
  AttributeDataType,
  OrderStatus,
  publicOrderSchema,
  StockUnit,
  type PublicOrderInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { headerValue, type HttpResponse } from '../../../common/http';
import { apiKeyCaller, requestHashOf } from '../../../common/idempotency/idempotency.service';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OrderTracking } from '../../orders/services/order-tracking';
import type { TrackedOrderView } from '../../orders/types/orders';
import type { PublicApiRequest } from '../guards/public-key.guard';
import { OrderLimits } from '../services/order-limits';
import { PublicOrderService } from '../services/public-order.service';
import { API_CLOCK } from '../tokens';
import { taxLineSchema } from '../../team/dto/orders.dto';
import { PublicApi } from './public-shop.controller';

// ORD-02: the route a shopper's order is made at, as its idempotency key is scoped to it (D4-8).
const PLACE_PATH = '/v1/orders';
// ORD-05: a tracking ID's form; anything else is not one.
const TRACKING_ID = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

const itemSchema = z.object({
  variantId: z.string().nullable(),
  productName: z.string(),
  attributes: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      dataType: z.nativeEnum(AttributeDataType),
      unitKind: z.string().nullable(),
      variantDefining: z.boolean(),
    }),
  ),
  quantity: z.string(),
  stockUnit: z.nativeEnum(StockUnit),
  unitPrice: z.string(),
  itemTotal: z.string(),
  modifiers: z.array(
    z.object({ groupName: z.string(), optionName: z.string(), priceChange: z.string() }),
  ),
});
const totals = {
  subtotal: z.string(),
  deliveryCharge: z.string(),
  discount: z.string(),
  grandTotal: z.string(),
  codAmount: z.string(),
  taxes: z.array(taxLineSchema),
};
class PublicOrderBodyDto extends createZodDto(publicOrderSchema) {}
class PlacedOrderDto extends createZodDto(
  z.object({
    orderNumber: z.string(),
    trackingId: z.string(),
    status: z.nativeEnum(OrderStatus),
    createdAt: z.coerce.date(),
    items: z.array(itemSchema),
    ...totals,
    purchaseEventId: z.string(),
  }),
) {}
class TrackedOrderDto extends createZodDto(
  z.object({
    orderNumber: z.string(),
    trackingId: z.string(),
    status: z.nativeEnum(OrderStatus),
    timeline: z.array(
      z.object({
        step: z.enum(['placed', 'confirmed', 'shipped', 'delivered', 'cancelled']),
        at: z.coerce.date(),
      }),
    ),
    items: z.array(itemSchema),
    ...totals,
    due: z.string(),
    courier: z
      .object({
        name: z.string().nullable(),
        trackingCode: z.string().nullable(),
        trackingLink: z.string().nullable(),
      })
      .nullable(),
  }),
) {}

// ORD-02, ORD-17, ORD-21, RTE-06, RTE-08 (Phase 4 Slice 4.2): a shopper's cash-on-delivery order, placed once per
// Idempotency-Key, and its tracking by ID. Both sit behind the public key's gate; each has its own per-minute windows.
@ApiTags('Public API')
@Controller('public')
@PublicApi()
export class PublicOrdersController {
  constructor(
    @Inject(PublicOrderService) private readonly orders: PublicOrderService,
    @Inject(OrderTracking) private readonly tracking: OrderTracking,
    @Inject(OrderLimits) private readonly limits: OrderLimits,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
    @Inject(API_CLOCK) private readonly clock: () => Date,
  ) {}

  @Post('orders')
  @ResponseMessage('OrderCreated')
  @ApiOperation({
    summary:
      "A shopper's cash-on-delivery order; it holds its stock, starts pending, and runs once per Idempotency-Key (ORD-02, ORD-21)",
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: PublicOrderBodyDto })
  @ZodResponse({ type: PlacedOrderDto })
  async place(
    @Body(new ZodValidationPipe(PublicOrderBodyDto.schema)) body: PublicOrderInput,
    @Req() request: PublicApiRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<unknown> {
    const shop = request.apiShop;
    const key = request.apiKey;
    if (!shop || !key) throw new Error('the public key guard names the shop and its key');
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey) throw new ApiError('validation_error', 'IdempotencyKeyRequired', {});
    await this.limits.admitOrder(shop, request, this.clock());
    const tenantId = shop.row.id;
    const placed = await this.orders.place(tenantId, body, key, this.clientIp.resolve(request), {
      scope: { tenantId, caller: apiKeyCaller(key.id) },
      key: idempotencyKey,
      path: PLACE_PATH,
      requestHash: requestHashOf(body),
    });
    if (!placed.replayed) return placed.order;
    response.setHeader('Idempotent-Replay', 'true');
    return placed.body;
  }

  @Get('track/:trackingId')
  @ResponseMessage('OrderTracked')
  @ApiOperation({
    summary:
      "An order by its tracking ID: status, timeline, items, totals and, once shipped, its courier -- never the customer's address or phone (ORD-17)",
  })
  @ZodResponse({ type: TrackedOrderDto })
  track(
    @Param('trackingId') trackingId: string,
    @Req() request: PublicApiRequest,
  ): Promise<TrackedOrderView> {
    const shop = request.apiShop;
    if (!shop) throw new Error('the public key guard names the shop');
    this.limits.admitTracking(shop, request, this.clock());
    const id = trackingId.toUpperCase();
    if (!TRACKING_ID.test(id)) throw new ApiError('not_found', 'OrderNotFound', {});
    return this.tracking.track(shop.row.id, id);
  }
}
