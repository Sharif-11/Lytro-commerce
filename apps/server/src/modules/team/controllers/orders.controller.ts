import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { orderListQuerySchema, Permission, type OrderListQuery } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { OkDto } from '../../../common/dto/ok.dto';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { headerValue, type HttpResponse } from '../../../common/http';
import { IdempotencyInterceptor } from '../../../common/idempotency/idempotency.interceptor';
import { dashboardCaller, requestHashOf } from '../../../common/idempotency/idempotency.service';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { CourierBooking } from '../../couriers/services/courier-booking';
import { CourierChecks } from '../../couriers/services/courier-checks';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { OrderFulfilment } from '../../orders/services/order-fulfilment';
import { OrderPayments } from '../../orders/services/order-payments';
import { OrderPicker } from '../../orders/services/order-picker';
import { OrderService } from '../../orders/services/order.service';
import type { HandlingShop } from '../../orders/services/handling-quota';
import type {
  OrderPage,
  OrderPaymentLink,
  OrderPickerPage,
  OrderPickerProduct,
  OrderQuote,
  OrderSerialItem,
  OrderView,
} from '../../orders/types/orders';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import {
  CancelOrderDto,
  CreateOrderDto,
  HandOverOrderDto,
  LogCallDto,
  OpenedPaymentDto,
  OrderPageDto,
  OrderPaymentDto,
  OrderQuoteDto,
  OrderViewDto,
  OrderPickerPageDto,
  OrderPickerProductDto,
  OrderPickerQueryDto,
  OrderSerialsDto,
  RecentCouriersDto,
  OverrideOrderDto,
  PaymentLinkDto,
  QuoteOrderDto,
  RefundPaymentDto,
  ReturnOrderDto,
  ShipOrderDto,
  UpdateOrderDto,
  VoidPaymentDto,
} from '../dto/orders.dto';
import { BookOrderDto, CancelParcelDto, SettleParcelDto } from '../dto/couriers.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// ORD-01, ORD-13: the route an order is made at, as its idempotency key is scoped to it (D4-8).
const CREATE_PATH = '/orders';

// ORD-01 to ORD-14, ORD-41, ORD-45, ORD-51, ORD-52 (Phase 4 Slice 4.1): the shop's orders as staff enter and handle
// them; shipping, handing over, delivering and returning them by hand (Slice 4.3); the payments staff record on them
// (Slice 4.3b); the payment links staff send (Phase 5 Slice 5.2b), and refunds (Slice 5.3). Reading them needs orders:read; making, changing,
// calling about, cancelling, holding and moving them, and making a payment link, orders:manage; deleting one,
// orders:delete; recording, voiding or refunding a payment, payments:manage -- with a new order too.
@ApiTags('Orders')
@Controller('orders')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class OrdersController {
  constructor(
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(OrderFulfilment) private readonly fulfilment: OrderFulfilment,
    @Inject(OrderPayments) private readonly payments: OrderPayments,
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
    @Inject(OrderPicker) private readonly picking: OrderPicker,
    @Inject(CourierBooking) private readonly booking: CourierBooking,
    @Inject(CourierChecks) private readonly checks: CourierChecks,
  ) {}

  @Get()
  @RequirePermission(Permission.OrdersRead)
  @ResponseMessage('OrdersRetrieved')
  @ApiOperation({
    summary: "The shop's orders, newest first, filtered and searched (ORD-13, ORD-45)",
  })
  @ZodResponse({ type: OrderPageDto })
  list(
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
    @Req() request: DashboardRequest,
  ): Promise<OrderPage> {
    return this.orders.list(this.request.tenantIdOf(request), query);
  }

  @Post()
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderCreated')
  @ApiOperation({
    summary:
      'Enter an order; it holds its stock, and runs once per Idempotency-Key (ORD-01, D4-8); a payment received with it needs payments:manage too (ORD-22)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: CreateOrderDto })
  @ZodResponse({ type: OrderViewDto })
  async create(
    @Body(new ZodValidationPipe(CreateOrderDto.schema)) body: CreateOrderDto,
    @Req() request: DashboardRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<unknown> {
    const key = headerValue(request.headers['idempotency-key']);
    if (!key) throw new ApiError('idempotency_key_required', 'IdempotencyKeyRequired', {});
    // ORD-22, agreed 2026-10-30: recording the payment that comes with it is payments:manage's, as on its own route.
    if (
      body.payment !== undefined &&
      !(await this.request.holds(request, Permission.PaymentsManage))
    ) {
      throw new ApiError('forbidden', 'PermissionDenied', {
        permission: Permission.PaymentsManage,
      });
    }
    const tenantId = this.request.tenantIdOf(request);
    const created = await this.orders.create(tenantId, body, this.request.actorOf(request), {
      scope: { tenantId, caller: dashboardCaller(request.session?.userId ?? null) },
      key,
      path: CREATE_PATH,
      requestHash: requestHashOf(body),
    });
    if (!created.replayed) return created.order;
    response.setHeader('Idempotent-Replay', 'true');
    return created.body;
  }

  @Post('quote')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderPriced')
  @ApiOperation({
    summary:
      "Price an order as it would be made, without making it or holding stock; the customer's details aren't needed yet (D4-9)",
  })
  @ApiBody({ type: QuoteOrderDto })
  @ZodResponse({ type: OrderQuoteDto })
  quote(
    @Body(new ZodValidationPipe(QuoteOrderDto.schema)) body: QuoteOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderQuote> {
    return this.orders.quote(this.request.tenantIdOf(request), body);
  }

  @Get('couriers')
  @RequirePermission(Permission.OrdersRead)
  @ResponseMessage('CouriersRetrieved')
  @ApiOperation({
    summary: 'The couriers the shop has shipped with, the most recent first (ORD-09)',
  })
  @ZodResponse({ type: RecentCouriersDto })
  async couriers(@Req() request: DashboardRequest): Promise<{ couriers: string[] }> {
    return { couriers: await this.orders.recentCouriers(this.request.tenantIdOf(request)) };
  }

  @Get('picker')
  @RequirePermission([Permission.OrdersManage, Permission.ProductsManage])
  @ResponseMessage('ProductsListed')
  @ApiOperation({
    summary:
      "New order's Add an item: the shop's products found by name, with the units each has on sale (Slice 4.8a)",
  })
  @ZodResponse({ type: OrderPickerPageDto })
  async picker(
    @Query(new ZodValidationPipe(OrderPickerQueryDto.schema)) query: OrderPickerQueryDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderPickerPage> {
    return this.picking.list(await this.request.shopOf(request), query.search, query.page);
  }

  @Get('picker/:productId')
  @RequirePermission([Permission.OrdersManage, Permission.ProductsManage])
  @ResponseMessage('ProductRetrieved')
  @ApiOperation({
    summary:
      "New order's Add an item, one product: its variants and their units, a combo's parts, its add-on groups (Slice 4.8a)",
  })
  @ZodResponse({ type: OrderPickerProductDto })
  pickerProduct(
    @Param('productId') productId: string,
    @Req() request: DashboardRequest,
  ): Promise<OrderPickerProduct> {
    return this.picking.product(
      this.request.tenantIdOf(request),
      this.request.idOf(productId, 'ProductNotFound'),
    );
  }

  @Get(':id')
  @RequirePermission(Permission.OrdersRead)
  @ResponseMessage('OrderRetrieved')
  @ApiOperation({ summary: 'One order: items, prices, calls and history (ORD-14)' })
  @ZodResponse({ type: OrderViewDto })
  get(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OrderView> {
    return this.orders.get(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderUpdated')
  @ApiOperation({
    summary: "Change an order's customer, items, prices or notes until it ships (ORD-11)",
  })
  @ApiBody({ type: UpdateOrderDto })
  @ZodResponse({ type: OrderViewDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOrderDto.schema)) body: UpdateOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.orders.update(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/calls')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderCallSaved')
  @ApiOperation({
    summary:
      'Log a call to the customer: confirmed, no answer, call back later or cancelled (ORD-51)',
  })
  @ApiBody({ type: LogCallDto })
  @ZodResponse({ type: OrderViewDto })
  logCall(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LogCallDto.schema)) body: LogCallDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.orders.logCall(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderCancelled')
  @ApiOperation({
    summary:
      'Cancel an order that has not shipped, with its reason; its stock is let go, or, booked with a courier, comes back, with the parcel cancelled there or confirmed by staff (ORD-52, CRR-28)',
  })
  @ApiBody({ type: CancelOrderDto })
  @ZodResponse({ type: OrderViewDto })
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelOrderDto.schema)) body: CancelOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.booking.cancelOrder(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Get(':id/serials')
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderSerialsRetrieved')
  @ApiOperation({
    summary:
      "An order's serial-numbered units: the serials each can be sent with, and those it was sent with (INV-14)",
  })
  @ZodResponse({ type: OrderSerialsDto })
  async serials(
    @Param('id') id: string,
    @Req() request: DashboardRequest,
  ): Promise<{ items: OrderSerialItem[] }> {
    return {
      items: await this.fulfilment.serials(
        this.request.tenantIdOf(request),
        this.request.idOf(id, 'OrderNotFound'),
      ),
    };
  }

  @Post(':id/book')
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderBooked')
  @ApiOperation({
    summary:
      'Book a delivery order with its courier, once per Idempotency-Key: the courier called, then the order handled (counted, charged on pay-as-you-go), its stock out with its serials and moved to processing; a refusal changes nothing, and a lost answer stays open until it is settled (CRR-05 to CRR-10, CRR-18, API-11, D6-7)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiBody({ type: BookOrderDto })
  @ZodResponse({ type: OrderViewDto })
  book(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(BookOrderDto.schema)) body: BookOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.booking.book(
      this.shopOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/parcel/settle')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('ParcelSettled')
  @ApiOperation({
    summary:
      "Settle an order's booking from what the courier's panel says after a lost answer, or finish one whose stock wasn't ready (CRR-18, D6-11)",
  })
  @ApiBody({ type: SettleParcelDto })
  @ZodResponse({ type: OrderViewDto })
  settleParcel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SettleParcelDto.schema)) body: SettleParcelDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.booking.settle(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/parcel/sync')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('ParcelSynced')
  @ApiOperation({
    summary:
      "Ask the courier where this order's parcel stands; within 10 minutes of the last ask, or once it has finished, the saved answer shows with no call (CRR-14)",
  })
  @ZodResponse({ type: OrderViewDto })
  syncParcel(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OrderView> {
    return this.checks.sync(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
    );
  }

  @Post(':id/parcel/cancel')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('ParcelCancelled')
  @ApiOperation({
    summary:
      'Cancel only the booking and keep the order, to book again or mark shipped by hand, with no second fee or count (QTA-01, CRR-28)',
  })
  @ApiBody({ type: CancelParcelDto })
  @ZodResponse({ type: OrderViewDto })
  cancelParcel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelParcelDto.schema)) body: CancelParcelDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.booking.cancelBooking(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/ship')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderShipped')
  @ApiOperation({
    summary:
      'Mark a delivery order shipped with its courier and a tracking code or link; it is handled (counted, charged on pay-as-you-go) and its stock leaves (ORD-09, QTA-01, PYG-02)',
  })
  @ApiBody({ type: ShipOrderDto })
  @ZodResponse({ type: OrderViewDto })
  ship(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ShipOrderDto.schema)) body: ShipOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.fulfilment.ship(
      this.shopOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/hand-over')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderHandedOver')
  @ApiOperation({
    summary:
      'Hand a takeaway or dine-in order to its customer: shipped and delivered in one step, its cash collected (agreed 2026-10-30)',
  })
  @ApiBody({ type: HandOverOrderDto })
  @ZodResponse({ type: OrderViewDto })
  handOver(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(HandOverOrderDto.schema)) body: HandOverOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.fulfilment.handOver(
      this.shopOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/deliver')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderDelivered')
  @ApiOperation({
    summary:
      'Mark a shipped order delivered; its cash on delivery is collected (ORD-42, agreed 2026-10-30)',
  })
  @ZodResponse({ type: OrderViewDto })
  deliver(@Param('id') id: string, @Req() request: DashboardRequest): Promise<OrderView> {
    return this.fulfilment.deliver(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      this.request.actorOf(request),
    );
  }

  @Post(':id/returns')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderReturnRecorded')
  @ApiOperation({
    summary:
      'Units of a shipped order that came back, each item sellable again or damaged; returned once every unit is back (ORD-10, INV-17)',
  })
  @ApiBody({ type: ReturnOrderDto })
  @ZodResponse({ type: OrderViewDto })
  returns(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReturnOrderDto.schema)) body: ReturnOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.fulfilment.returnItems(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/payments')
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('OrderPaymentRecorded')
  @ApiOperation({
    summary:
      'Record money received for an order -- cash, a wallet with its sender and transaction ID, or a bank transfer with its reference -- verified at once; never more than is due (ORD-15, ORD-43)',
  })
  @ApiBody({ type: OrderPaymentDto })
  @ZodResponse({ type: OrderViewDto })
  recordPayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(OrderPaymentDto.schema)) body: OrderPaymentDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.payments.record(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/payment-link')
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('PaymentLinkMade')
  @ApiOperation({
    summary:
      "Make a payment link to send the customer: the payment page, open 24 hours, for the advance still owed, else what is due, or the whole due with `full`; the order's earlier link closes (PAY-24)",
  })
  @ApiBody({ type: PaymentLinkDto })
  @ZodResponse({ type: OpenedPaymentDto })
  makePaymentLink(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PaymentLinkDto.schema)) body: PaymentLinkDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderPaymentLink> {
    return this.sessions.makeLink(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
      new Date(),
    );
  }

  @Post(':id/payments/:paymentId/void')
  @HttpCode(200)
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('OrderPaymentVoided')
  @ApiOperation({
    summary:
      'Void a payment recorded by mistake, with the reason; it stays in the history and what is due goes back up (agreed 2026-10-30)',
  })
  @ApiBody({ type: VoidPaymentDto })
  @ZodResponse({ type: OrderViewDto })
  voidPayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(VoidPaymentDto.schema)) body: VoidPaymentDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.payments.void(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      this.request.idOf(paymentId, 'OrderPaymentNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/payments/:paymentId/refund')
  @HttpCode(200)
  @RequirePermission(Permission.PaymentsManage)
  @ResponseMessage('OrderPaymentRefunded')
  @ApiOperation({
    summary:
      'Mark a payment refunded, with a note -- a record only, no money moves; it stops counting and what is due goes back up (PAY-20, ORD-44)',
  })
  @ApiBody({ type: RefundPaymentDto })
  @ZodResponse({ type: OrderViewDto })
  refundPayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(RefundPaymentDto.schema)) body: RefundPaymentDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.payments.refund(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      this.request.idOf(paymentId, 'OrderPaymentNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Post(':id/override')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersManage)
  @ResponseMessage('OrderStatusSet')
  @ApiOperation({ summary: 'Hold an order, put it in review, or clear either (ORD-41)' })
  @ApiBody({ type: OverrideOrderDto })
  @ZodResponse({ type: OrderViewDto })
  override(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(OverrideOrderDto.schema)) body: OverrideOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.orders.override(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      body,
      this.request.actorOf(request),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.OrdersDelete)
  @ResponseMessage('OrderDeleted')
  @ApiOperation({
    summary: 'Delete an order that has not shipped and has no verified payment (ORD-12)',
  })
  @ZodResponse({ type: OkDto })
  async delete(@Param('id') id: string, @Req() request: DashboardRequest): Promise<{ ok: true }> {
    await this.orders.delete(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
      this.request.actorOf(request),
    );
    return { ok: true };
  }

  /** QTA-01, UPG-10: the shop with its own limits and what its usage cycle counts from, as its summary carries them. */
  private shopOf(request: DashboardRequest): HandlingShop {
    const tenant = request.tenant;
    if (!tenant) throw new ApiError('forbidden', 'CreateShopToContinue', { next: 'create-shop' });
    return tenant;
  }
}
