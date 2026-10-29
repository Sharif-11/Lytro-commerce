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
import { dashboardCaller, requestHashOf } from '../../../common/idempotency/idempotency.service';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { OrderService } from '../../orders/services/order.service';
import type { OrderPage, OrderQuote, OrderView } from '../../orders/types/orders';
import {
  CancelOrderDto,
  CreateOrderDto,
  LogCallDto,
  OrderPageDto,
  OrderQuoteDto,
  OrderViewDto,
  OverrideOrderDto,
  UpdateOrderDto,
} from '../dto/orders.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// ORD-01, ORD-13: the route an order is made at, as its idempotency key is scoped to it (D4-8).
const CREATE_PATH = '/orders';

// ORD-01 to ORD-14, ORD-41, ORD-45, ORD-51, ORD-52 (Phase 4 Slice 4.1): the shop's orders as staff enter and handle
// them. Reading them needs orders:read; making, changing, calling about, cancelling and holding them, orders:manage;
// deleting one, orders:delete.
@ApiTags('Orders')
@Controller('orders')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class OrdersController {
  constructor(
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
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
    summary: 'Enter an order; it holds its stock, and runs once per Idempotency-Key (ORD-01, D4-8)',
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
    if (!key) throw new ApiError('validation_error', 'IdempotencyKeyRequired', {});
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
    summary: 'Price an order as it would be made, without making it or holding stock (D4-9)',
  })
  @ApiBody({ type: CreateOrderDto })
  @ZodResponse({ type: OrderQuoteDto })
  quote(
    @Body(new ZodValidationPipe(CreateOrderDto.schema)) body: CreateOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderQuote> {
    return this.orders.quote(this.request.tenantIdOf(request), body);
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
    summary: 'Cancel an order that has not shipped, with its reason; its stock is let go (ORD-52)',
  })
  @ApiBody({ type: CancelOrderDto })
  @ZodResponse({ type: OrderViewDto })
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelOrderDto.schema)) body: CancelOrderDto,
    @Req() request: DashboardRequest,
  ): Promise<OrderView> {
    return this.orders.cancel(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'OrderNotFound'),
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
}
