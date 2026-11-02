import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { catalogueIdSchema } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { OkDto } from '../../../common/dto/ok.dto';
import type { MessageKey } from '../../../common/i18n/message-key';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { ListenerDevices } from '../../listener/services/listener-devices';
import type { ListenerDeviceList } from '../../listener/types/listener';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  BlockInstallationDto,
  InstallationBlockedDto,
  ListenerDeviceListDto,
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
