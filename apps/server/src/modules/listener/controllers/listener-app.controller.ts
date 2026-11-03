import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { listenerPairSchema, PaymentMethod, type ListenerPairInput } from '@lytronix/validators';
import { ClientIp } from '../../../common/client-ip';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { OkDto } from '../../../common/dto/ok.dto';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { headerValue, type HttpRequest } from '../../../common/http';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { ListenerDeviceGuard, type ListenerRequest } from '../guards/listener-device.guard';
import { ListenerApp } from '../services/listener-app';
import { ListenerPairing } from '../services/listener-pairing';
import type { ListenerConnected, ListenerPaired } from '../types/listener';

class ListenerPairDto extends createZodDto(listenerPairSchema) {}
const appFacts = {
  accounts: z.array(z.object({ method: z.nativeEnum(PaymentMethod), number: z.string() })),
  senders: z.array(z.string()),
  testModeUntil: z.coerce.date().nullable(),
};
class ListenerPairedDto extends createZodDto(
  z.object({
    deviceId: z.string(),
    token: z.string(),
    deviceName: z.string(),
    shopName: z.string(),
    heartbeatMinutes: z.number(),
    ...appFacts,
  }),
) {}
class ListenerConnectedDto extends createZodDto(
  z.object({
    status: z.literal('connected'),
    heartbeatMinutes: z.number(),
    serverTime: z.coerce.date(),
    deviceName: z.string(),
    shopName: z.string(),
    ...appFacts,
  }),
) {}
class ListenerTestModeDto extends createZodDto(z.object({ testModeUntil: z.coerce.date() })) {}

const APP_VERSION_HEADER = {
  name: 'x-app-version',
  required: true,
  description: 'The listener app version, as 1.2.3 (LSN-18)',
} as const;

// LSN-01 to LSN-03, LSN-07, LSN-11 to LSN-13, LSN-18, LSN-24 (Phase 5 Slice 5.4a, read agreed 2026-11-01): the
// listener app's own routes, on the API host at /v1/listener/..., with no API key -- a pairing code, then the
// device's token. Each answer, or refusal, is what the app shows: connected, subscription inactive (`tenant_offline`),
// revoked (`unauthenticated`, `details.reason`), update required (`app_update_required`) or device limit reached
// (`plan_limit_reached`).
@ApiTags('Listener app')
@Controller('public/listener')
@PublicApiRoute()
export class ListenerAppController {
  constructor(
    @Inject(ListenerPairing) private readonly pairing: ListenerPairing,
    @Inject(ListenerApp) private readonly app: ListenerApp,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Post('pair')
  @ResponseMessage('ListenerPaired')
  @ApiOperation({
    summary:
      "Pair this phone with the owner's code: the device token, shown once, bound to this installation (LSN-01, LSN-11)",
  })
  @ApiHeader(APP_VERSION_HEADER)
  @ApiBody({ type: ListenerPairDto })
  @ZodResponse({ type: ListenerPairedDto })
  pair(
    @Body(new ZodValidationPipe(ListenerPairDto.schema)) body: ListenerPairInput,
    @Req() request: HttpRequest,
  ): Promise<ListenerPaired> {
    return this.pairing.pair(
      body,
      headerValue(request.headers['x-app-version']),
      this.clientIp.resolve(request),
    );
  }

  @Post('heartbeat')
  @HttpCode(200)
  @UseGuards(ListenerDeviceGuard)
  @ResponseMessage('ListenerConnected')
  @ApiOperation({
    summary: 'The phone reports it is alive, every 15 minutes, at most 4 an hour (LSN-03, LSN-13)',
  })
  @ApiHeader({ name: 'x-installation-id', required: true })
  @ApiHeader(APP_VERSION_HEADER)
  @ZodResponse({ type: ListenerConnectedDto })
  heartbeat(@Req() request: ListenerRequest): Promise<ListenerConnected> {
    const device = request.listenerDevice;
    const version = request.listenerAppVersion;
    if (!device || version === undefined) throw new Error('the listener guard names the device');
    return this.app.heartbeat(device, version);
  }

  @Post('test-mode')
  @HttpCode(200)
  @UseGuards(ListenerDeviceGuard)
  @ResponseMessage('ListenerTestModeStarted')
  @ApiOperation({
    summary:
      'Test mode on for 10 minutes, from the paired phone: a message that looks like a receipt from an unknown sender is read and shown, and verifies nothing (LSN-04)',
  })
  @ApiHeader({ name: 'x-installation-id', required: true })
  @ApiHeader(APP_VERSION_HEADER)
  @ZodResponse({ type: ListenerTestModeDto })
  async testMode(@Req() request: ListenerRequest): Promise<{ testModeUntil: Date }> {
    const device = request.listenerDevice;
    if (!device) throw new Error('the listener guard names the device');
    return {
      testModeUntil: await this.app.startTestMode(device, this.clientIp.resolve(request)),
    };
  }

  @Post('unpair')
  @HttpCode(200)
  @UseGuards(ListenerDeviceGuard)
  @ResponseMessage('ListenerUnpaired')
  @ApiOperation({
    summary: "The phone unpairs itself, freeing its place on the shop's plan (the app's menu)",
  })
  @ApiHeader({ name: 'x-installation-id', required: true })
  @ApiHeader(APP_VERSION_HEADER)
  @ZodResponse({ type: OkDto })
  async unpair(@Req() request: ListenerRequest): Promise<{ ok: true }> {
    const device = request.listenerDevice;
    if (!device) throw new Error('the listener guard names the device');
    await this.app.unpair(device, this.clientIp.resolve(request));
    return { ok: true };
  }
}
