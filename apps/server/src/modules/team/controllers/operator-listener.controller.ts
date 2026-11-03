import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  catalogueIdSchema,
  type ListenerReceiptsQuery,
  type ListenerUnreadQuery,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { OkDto } from '../../../common/dto/ok.dto';
import type { MessageKey } from '../../../common/i18n/message-key';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { ListenerDevices } from '../../listener/services/listener-devices';
import { ListenerPairing } from '../../listener/services/listener-pairing';
import { LytroReceipts } from '../../lytro-receipts/services/lytro-receipts';
import type { LytroReceiptPage } from '../../lytro-receipts/types/lytro-receipts';
import type { ListenerCode, ListenerDeviceList } from '../../listener/types/listener';
import { ListenerReceipts } from '../../listener-receipts/services/listener-receipts';
import type { ListenerUnreadItem } from '../../listener-receipts/types/listener-receipts';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  BlockInstallationDto,
  InstallationBlockedDto,
  ListenerCodeDto,
  ListenerDeviceListDto,
  ListenerReceiptsQueryDto,
  LytroReceiptPageDto,
  ListenerUnreadDto,
  ListenerUnreadQueryDto,
} from '../dto/listener.dto';

// LSN-20, LSN-21 (Phase 5 Slice 5.4a): Lytro's view of a shop's listener phones against its plan's limit, revoking any
// phone, and blocking an app installation across the platform.
@ApiTags('Operator Listener')
@Controller('operator')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorListenerController {
  constructor(
    @Inject(ListenerDevices) private readonly devices: ListenerDevices,
    @Inject(ListenerReceipts) private readonly receipts: ListenerReceipts,
    @Inject(ListenerPairing) private readonly pairing: ListenerPairing,
    @Inject(LytroReceipts) private readonly lytro: LytroReceipts,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get('tenants/:id/listener-devices')
  @ResponseMessage('ListenerDevicesListed')
  @ApiOperation({
    summary: "A shop's listener phones, with how many work and its plan's limit (LSN-20)",
  })
  @ZodResponse({ type: ListenerDeviceListDto })
  list(@Param('id') id: string): Promise<ListenerDeviceList> {
    return this.devices.listForOperator(this.idOf(id, 'ShopNotFound'));
  }

  @Post('lytro-listener/pairing-codes')
  @ResponseMessage('ListenerCodeMade')
  @ApiOperation({
    summary: "A code to pair Lytro's own listener phone, which verifies sellers' payments (PAY-21)",
  })
  @ZodResponse({ type: ListenerCodeDto })
  lytroCode(@Req() request: OperatorSessionRequest): Promise<ListenerCode> {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return this.pairing.createLytroCode(session.operatorId);
  }

  @Get('lytro-listener/devices')
  @ResponseMessage('ListenerDevicesListed')
  @ApiOperation({ summary: "Lytro's own listener phones (PAY-21)" })
  @ZodResponse({ type: ListenerDeviceListDto })
  lytroDevices(): Promise<ListenerDeviceList> {
    return this.devices.listForLytro();
  }

  @Get('lytro-listener/receipts')
  @ResponseMessage('ListenerReceiptsListed')
  @ApiOperation({
    summary:
      "What Lytro's own phones forwarded -- unclaimed, with the operator or used -- newest first, by status, searched by the start of a transaction ID, sender number or amount (PAY-21)",
  })
  @ZodResponse({ type: LytroReceiptPageDto })
  lytroReceipts(
    @Query(new ZodValidationPipe(ListenerReceiptsQueryDto.schema)) query: ListenerReceiptsQuery,
  ): Promise<LytroReceiptPage> {
    return this.lytro.list(query);
  }

  @Get('listener-unread')
  @ResponseMessage('ListenerUnreadListed')
  @ApiOperation({
    summary:
      'The wording of wallet messages the parser could not read, numbers and notes removed, with how many arrived each day (VER-06)',
  })
  @ZodResponse({ type: ListenerUnreadDto })
  async unread(
    @Query(new ZodValidationPipe(ListenerUnreadQueryDto.schema)) query: ListenerUnreadQuery,
  ): Promise<{ shapes: ListenerUnreadItem[] }> {
    return { shapes: await this.receipts.unread(query.days) };
  }

  @Post('listener-devices/:id/revoke')
  @HttpCode(200)
  @ResponseMessage('ListenerDeviceRevoked')
  @ApiOperation({ summary: "Revoke any shop's listener phone (LSN-19, LSN-21)" })
  @ZodResponse({ type: OkDto })
  async revoke(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ ok: true }> {
    await this.devices.operatorRevoke(
      this.idOf(id, 'ListenerDeviceNotFound'),
      this.operatorOf(request),
      this.clientIp.resolve(request),
    );
    return { ok: true };
  }

  @Post('listener-installations/block')
  @HttpCode(200)
  @ResponseMessage('ListenerInstallationBlockedDone')
  @ApiOperation({
    summary:
      'Block an app installation across the platform, with why: it pairs with no shop again and its phones are revoked (LSN-21)',
  })
  @ApiBody({ type: BlockInstallationDto })
  @ZodResponse({ type: InstallationBlockedDto })
  async block(
    @Body(new ZodValidationPipe(BlockInstallationDto.schema)) body: BlockInstallationDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<{ revoked: number }> {
    return {
      revoked: await this.devices.blockInstallation(
        body.installationId,
        body.reason,
        this.operatorOf(request),
        this.clientIp.resolve(request),
      ),
    };
  }

  private operatorOf(request: OperatorSessionRequest): string {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return session.operatorId;
  }

  /** An id that is not one finds nothing, as an unknown one does. */
  private idOf(raw: string, notFound: MessageKey): string {
    const parsed = catalogueIdSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError('not_found', notFound, {});
    return parsed.data;
  }
}
