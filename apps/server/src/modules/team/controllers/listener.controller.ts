import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Permission, type ListenerReceiptsQuery } from '@lytronix/validators';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { ListenerDevices } from '../../listener/services/listener-devices';
import { ListenerPairing } from '../../listener/services/listener-pairing';
import { ListenerReceipts } from '../../listener-receipts/services/listener-receipts';
import type { ReceiptPage } from '../../listener-receipts/types/listener-receipts';
import type {
  ListenerCode,
  ListenerDeviceList,
  ListenerDeviceView,
} from '../../listener/types/listener';
import {
  ListenerCodeDto,
  ListenerDeviceDto,
  ListenerDeviceListDto,
  ListenerReceiptsQueryDto,
  ReceiptPageDto,
  RenameListenerDeviceDto,
} from '../dto/listener.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

// LSN-01, LSN-02, LSN-08, LSN-09, LSN-20 (Phase 5 Slice 5.4a, read agreed 2026-11-01): the shop's listener phones --
// a pairing code to pair one, the list with the plan's limit (listener:read), and renaming or revoking one
// (listener:manage, the owner always).
@ApiTags('Listener')
@Controller('listener')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class ListenerController {
  constructor(
    @Inject(ListenerPairing) private readonly pairing: ListenerPairing,
    @Inject(ListenerDevices) private readonly devices: ListenerDevices,
    @Inject(ListenerReceipts) private readonly receipts: ListenerReceipts,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Post('pairing-codes')
  @RequirePermission(Permission.ListenerManage)
  @ResponseMessage('ListenerCodeMade')
  @ApiOperation({
    summary:
      "A code to pair a listener phone with: single use, open 10 minutes, shown once; refused when the shop's phones fill its plan (LSN-01, LSN-08, LSN-09)",
  })
  @ZodResponse({ type: ListenerCodeDto })
  createCode(@Req() request: DashboardRequest): Promise<ListenerCode> {
    return this.pairing.createCode(this.request.tenantIdOf(request), this.request.actorOf(request));
  }

  @Get('devices')
  @RequirePermission(Permission.ListenerRead)
  @ResponseMessage('ListenerDevicesListed')
  @ApiOperation({
    summary:
      "The shop's listener phones -- name, model, app version, last seen, online and status -- with how many work and the plan's limit (LSN-20)",
  })
  @ZodResponse({ type: ListenerDeviceListDto })
  list(@Req() request: DashboardRequest): Promise<ListenerDeviceList> {
    return this.devices.list(this.request.tenantIdOf(request));
  }

  @Get('receipts')
  @RequirePermission(Permission.PaymentsVerify)
  @ResponseMessage('ListenerReceiptsListed')
  @ApiOperation({
    summary:
      'The receipts phones forwarded -- unclaimed, with staff or used -- newest first, by status, searched by the start of a transaction ID, sender number or amount (agreed 2026-11-02)',
  })
  @ZodResponse({ type: ReceiptPageDto })
  receiptsList(
    @Query(new ZodValidationPipe(ListenerReceiptsQueryDto.schema)) query: ListenerReceiptsQuery,
    @Req() request: DashboardRequest,
  ): Promise<ReceiptPage> {
    return this.receipts.list(this.request.tenantIdOf(request), query);
  }

  @Patch('devices/:id')
  @RequirePermission(Permission.ListenerManage)
  @ResponseMessage('ListenerDeviceRenamed')
  @ApiOperation({ summary: 'Rename a listener phone (LSN-20)' })
  @ApiBody({ type: RenameListenerDeviceDto })
  @ZodResponse({ type: ListenerDeviceDto })
  rename(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenameListenerDeviceDto.schema)) body: RenameListenerDeviceDto,
    @Req() request: DashboardRequest,
  ): Promise<ListenerDeviceView> {
    return this.devices.rename(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'ListenerDeviceNotFound'),
      body.name,
      this.request.actorOf(request),
    );
  }

  @Post('devices/:id/revoke')
  @HttpCode(200)
  @RequirePermission(Permission.ListenerManage)
  @ResponseMessage('ListenerDeviceRevoked')
  @ApiOperation({
    summary:
      'Revoke a listener phone: its next call is refused and it stops syncing (LSN-02, LSN-19)',
  })
  @ZodResponse({ type: ListenerDeviceDto })
  revoke(@Param('id') id: string, @Req() request: DashboardRequest): Promise<ListenerDeviceView> {
    return this.devices.revoke(
      this.request.tenantIdOf(request),
      this.request.idOf(id, 'ListenerDeviceNotFound'),
      this.request.actorOf(request),
    );
  }
}
