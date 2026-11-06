import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { connectCourierSchema, Permission, type CourierKey } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { OkDto } from '../../../common/dto/ok.dto';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import type { PickupStore } from '../../couriers/ports/courier-adapter';
import {
  CourierConnections,
  type CourierAdapterView,
  type CourierConnectionView,
} from '../../couriers/services/courier-connections';
import { CourierMessages, type MessageAddress } from '../../couriers/services/courier-messages';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  ConnectCourierDto,
  CourierAdapterListDto,
  CourierConnectedDto,
  CourierConnectionDto,
  CourierConnectionListDto,
  CourierStoreListDto,
  MessageAddressDto,
  SetPickupStoreDto,
} from '../dto/couriers.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

function courierKeyOf(key: string): CourierKey {
  const known = connectCourierSchema.shape.courierKey.safeParse(key);
  if (!known.success) throw new ApiError('not_found', 'CourierNotAvailable', {});
  return known.data;
}

// CRR-01 to CRR-05, CRR-20 (Phase 6 Slice 6.1, read agreed 2026-11-04): the couriers there are, and a shop's connections to them.
// Connecting is `couriers:manage`; whoever books can see which couriers are connected, never their credentials.
@ApiTags('Couriers')
@Controller('couriers')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class CouriersController {
  constructor(
    @Inject(CourierConnections) private readonly connections: CourierConnections,
    @Inject(CourierMessages) private readonly messages: CourierMessages,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get('adapters')
  @RequirePermission([Permission.CouriersManage, Permission.OrdersManage])
  @ResponseMessage('CourierAdaptersListed')
  @ApiOperation({
    summary: 'The couriers available, and the credential fields each needs (CRR-01)',
  })
  @ZodResponse({ type: CourierAdapterListDto })
  adapters(): { adapters: CourierAdapterView[] } {
    return { adapters: this.connections.adapters() };
  }

  @Get('connections')
  @RequirePermission([Permission.CouriersManage, Permission.OrdersManage])
  @ResponseMessage('CourierConnectionsListed')
  @ApiOperation({
    summary:
      "The shop's connected couriers, with whether each has credentials, never what they are (CRR-03)",
  })
  @ZodResponse({ type: CourierConnectionListDto })
  async list(@Req() request: DashboardRequest): Promise<{ connections: CourierConnectionView[] }> {
    return { connections: await this.connections.list(this.request.tenantIdOf(request)) };
  }

  @Post('connections')
  @HttpCode(200)
  @RequirePermission(Permission.CouriersManage)
  @ResponseMessage('CourierConnected')
  @ApiOperation({
    summary:
      "Connect a courier or replace its credentials; a test call must pass before anything is saved, and blank fields keep what's saved (CRR-02, CRR-03)",
  })
  @ApiBody({ type: ConnectCourierDto })
  @ZodResponse({ type: CourierConnectedDto })
  connect(
    @Body(new ZodValidationPipe(ConnectCourierDto.schema)) body: ConnectCourierDto,
    @Req() request: DashboardRequest,
  ): Promise<CourierConnectionView & { message: MessageAddress }> {
    return this.connections.connect(
      this.request.tenantIdOf(request),
      body,
      this.request.actorOf(request),
    );
  }

  @Delete('connections/:key')
  @RequirePermission(Permission.CouriersManage)
  @ResponseMessage('CourierDisconnected')
  @ApiOperation({
    summary: 'Disconnect a courier; its credentials go and past parcels stay (CRR-20)',
  })
  @ZodResponse({ type: OkDto })
  async disconnect(
    @Param('key') key: string,
    @Req() request: DashboardRequest,
  ): Promise<{ ok: true }> {
    await this.connections.disconnect(
      this.request.tenantIdOf(request),
      courierKeyOf(key),
      this.request.actorOf(request),
    );
    return { ok: true };
  }

  @Get('connections/:key/address')
  @RequirePermission(Permission.CouriersManage)
  @ResponseMessage('CourierAddressShown')
  @ApiOperation({
    summary:
      "What to paste into the courier's panel: Lytro's own address and token, shown again at any time, never the courier's credentials (CRR-02, CRR-03)",
  })
  @ZodResponse({ type: MessageAddressDto })
  address(@Param('key') key: string, @Req() request: DashboardRequest): Promise<MessageAddress> {
    return this.messages.addressOf(this.request.tenantIdOf(request), courierKeyOf(key));
  }

  @Post('connections/:key/address')
  @HttpCode(200)
  @RequirePermission(Permission.CouriersManage)
  @ResponseMessage('CourierAddressReplaced')
  @ApiOperation({
    summary:
      'A new address and token, if the old pair leaked: the old pair stops working at once, so both must be pasted again (CRR-03)',
  })
  @ZodResponse({ type: MessageAddressDto })
  replaceAddress(
    @Param('key') key: string,
    @Req() request: DashboardRequest,
  ): Promise<MessageAddress> {
    return this.messages.replaceAddress(
      this.request.tenantIdOf(request),
      courierKeyOf(key),
      this.request.actorOf(request),
    );
  }

  @Get('connections/:key/stores')
  @RequirePermission(Permission.CouriersManage)
  @ResponseMessage('CourierStoresListed')
  @ApiOperation({
    summary:
      'The stores this courier lists for the account, and which one parcels leave from, for a courier that has stores (Slice 6.3)',
  })
  @ZodResponse({ type: CourierStoreListDto })
  stores(
    @Param('key') key: string,
    @Req() request: DashboardRequest,
  ): Promise<{ stores: PickupStore[]; chosenId: string | null }> {
    return this.connections.pickupStores(this.request.tenantIdOf(request), courierKeyOf(key));
  }

  @Put('connections/:key/store')
  @RequirePermission(Permission.CouriersManage)
  @ResponseMessage('CourierPickupStoreChanged')
  @ApiOperation({
    summary:
      "The one store this courier's parcels leave from; it must be one the courier lists as active (Slice 6.3)",
  })
  @ApiBody({ type: SetPickupStoreDto })
  @ZodResponse({ type: CourierConnectionDto })
  setStore(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(SetPickupStoreDto.schema)) body: SetPickupStoreDto,
    @Req() request: DashboardRequest,
  ): Promise<CourierConnectionView> {
    return this.connections.setPickupStore(
      this.request.tenantIdOf(request),
      courierKeyOf(key),
      body,
      this.request.actorOf(request),
    );
  }

  @Put('connections/:key/default')
  @RequirePermission(Permission.CouriersManage)
  @ResponseMessage('CourierDefaultChanged')
  @ApiOperation({ summary: "The shop's default courier, which booking starts from (CRR-05)" })
  @ZodResponse({ type: CourierConnectionDto })
  setDefault(
    @Param('key') key: string,
    @Req() request: DashboardRequest,
  ): Promise<CourierConnectionView> {
    return this.connections.setDefault(
      this.request.tenantIdOf(request),
      courierKeyOf(key),
      this.request.actorOf(request),
    );
  }
}
